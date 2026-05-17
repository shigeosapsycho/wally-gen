//! One-shot IMAPS login test for the Settings "Test connection" button.
//!
//! Operates on the in-form values (not the saved .env) so the user can verify
//! a credential before committing it. Mirrors two behaviors of the engine:
//!   - strips whitespace from the password (Gmail App Passwords are commonly
//!     displayed as four 4-char groups);
//!   - infers `host:port` from the email domain when `IMAP_HOST` is blank for
//!     the handful of providers the IMAP_PRESETS dropdown lists.

use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use native_tls::TlsConnector;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const IO_TIMEOUT: Duration = Duration::from_secs(15);

pub fn ping(user: &str, pass: &str, host_input: &str) -> Result<String> {
    let user = user.trim();
    if user.is_empty() {
        return Err(anyhow!("IMAP user is empty"));
    }
    let pass: String = pass.chars().filter(|c| !c.is_whitespace()).collect();
    if pass.is_empty() {
        return Err(anyhow!("IMAP password is empty"));
    }

    let host_port = if host_input.trim().is_empty() {
        infer_host(user)
            .ok_or_else(|| {
                anyhow!(
                    "no IMAP host set and couldn't auto-detect from '{user}' — pick a host from the dropdown"
                )
            })?
            .to_string()
    } else {
        host_input.trim().to_string()
    };
    let (host, port) = parse_host_port(&host_port)?;

    let tls = TlsConnector::new().context("init TLS connector")?;
    let addr = resolve(&host, port)?;
    let tcp = TcpStream::connect_timeout(&addr, CONNECT_TIMEOUT)
        .with_context(|| format!("connect {host}:{port}"))?;
    tcp.set_read_timeout(Some(IO_TIMEOUT))?;
    tcp.set_write_timeout(Some(IO_TIMEOUT))?;

    let tls_stream = tls
        .connect(&host, tcp)
        .with_context(|| format!("TLS handshake with {host}:{port}"))?;
    let client = imap::Client::new(tls_stream);

    let mut session = client
        .login(user, &pass)
        .map_err(|(e, _)| anyhow!("login failed: {e}"))?;
    let mailbox = session
        .examine("INBOX")
        .with_context(|| "examine INBOX")?;
    let _ = session.logout();

    Ok(format!(
        "Connected to {host}:{port} — INBOX has {} message(s)",
        mailbox.exists
    ))
}

fn parse_host_port(s: &str) -> Result<(String, u16)> {
    match s.rsplit_once(':') {
        Some((h, p)) => {
            let port: u16 = p
                .parse()
                .map_err(|_| anyhow!("bad port in '{s}' — expected host:port"))?;
            if h.is_empty() {
                return Err(anyhow!("empty host in '{s}'"));
            }
            Ok((h.to_string(), port))
        }
        None => Ok((s.to_string(), 993)),
    }
}

fn resolve(host: &str, port: u16) -> Result<SocketAddr> {
    (host, port)
        .to_socket_addrs()
        .with_context(|| format!("DNS lookup for {host}"))?
        .next()
        .ok_or_else(|| anyhow!("DNS returned no addresses for {host}"))
}

fn infer_host(user: &str) -> Option<&'static str> {
    let domain = user.rsplit('@').next()?.trim().to_lowercase();
    match domain.as_str() {
        "gmail.com" | "googlemail.com" => Some("imap.gmail.com:993"),
        "icloud.com" | "me.com" | "mac.com" => Some("imap.mail.me.com:993"),
        "outlook.com" | "hotmail.com" | "live.com" | "msn.com" => {
            Some("outlook.office365.com:993")
        }
        "yahoo.com" | "ymail.com" | "rocketmail.com" => Some("imap.mail.yahoo.com:993"),
        "aol.com" => Some("imap.aol.com:993"),
        "ionos.com" => Some("imap.ionos.com:993"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_host_port_default_993() {
        let (h, p) = parse_host_port("imap.example.com").unwrap();
        assert_eq!(h, "imap.example.com");
        assert_eq!(p, 993);
    }

    #[test]
    fn parses_host_port_explicit() {
        let (h, p) = parse_host_port("imap.example.com:143").unwrap();
        assert_eq!(h, "imap.example.com");
        assert_eq!(p, 143);
    }

    #[test]
    fn rejects_bad_port() {
        assert!(parse_host_port("imap.example.com:abc").is_err());
    }

    #[test]
    fn infers_common_providers() {
        assert_eq!(infer_host("a@gmail.com"), Some("imap.gmail.com:993"));
        assert_eq!(infer_host("A@Hotmail.com"), Some("outlook.office365.com:993"));
        assert_eq!(infer_host("a@unknown.tld"), None);
    }
}
