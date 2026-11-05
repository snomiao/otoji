//! External control of `otoji-tray` — lets other apps (e.g. CapsLockX's
//! CLX+V) toggle otoji or drive push-to-talk without their own hotkey tap.
//!
//! Transport: a Unix **datagram** socket the tray binds at
//! `<data dir>/tray-ctl.sock` (see [`socket_path`]; `OTOJI_DATA_DIR`
//! overrides the data dir). Each datagram is one ASCII command, trimmed and
//! case-insensitive — see [`TrayCmd`]. Fire-and-forget: there is no reply.
//!
//! From a shell: `otoji-tray --send toggle`.

use std::path::PathBuf;

/// One command accepted on the tray control socket.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum TrayCmd {
    /// Flip otoji on/off (same as the Fn+/ hotkey).
    Toggle,
    /// Turn otoji on (no-op when already on).
    On,
    /// Turn otoji off (no-op when already off).
    Off,
    /// Start a push-to-talk segment (turns otoji on first if needed).
    PttStart,
    /// End the push-to-talk segment.
    PttEnd,
    /// Open the settings window.
    Settings,
}

impl TrayCmd {
    pub const ALL: [TrayCmd; 6] = [
        TrayCmd::Toggle,
        TrayCmd::On,
        TrayCmd::Off,
        TrayCmd::PttStart,
        TrayCmd::PttEnd,
        TrayCmd::Settings,
    ];

    /// Wire form of the command.
    pub fn as_str(self) -> &'static str {
        match self {
            TrayCmd::Toggle => "toggle",
            TrayCmd::On => "on",
            TrayCmd::Off => "off",
            TrayCmd::PttStart => "ptt-start",
            TrayCmd::PttEnd => "ptt-end",
            TrayCmd::Settings => "settings",
        }
    }

    /// Parse one datagram / CLI argument. Trims whitespace, ignores case.
    pub fn parse(s: &str) -> Option<TrayCmd> {
        let s = s.trim();
        TrayCmd::ALL
            .into_iter()
            .find(|c| c.as_str().eq_ignore_ascii_case(s))
    }
}

/// Where the tray binds its control socket.
pub fn socket_path() -> PathBuf {
    crate::notes::data_dir().join("tray-ctl.sock")
}

/// Send one command to a running tray. Errors when the socket is missing or
/// nobody is bound to it (tray not running).
#[cfg(unix)]
pub fn send(cmd: TrayCmd) -> std::io::Result<()> {
    let sock = std::os::unix::net::UnixDatagram::unbound()?;
    sock.send_to(cmd.as_str().as_bytes(), socket_path())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_round_trips_and_is_lenient() {
        for c in TrayCmd::ALL {
            assert_eq!(TrayCmd::parse(c.as_str()), Some(c));
        }
        assert_eq!(TrayCmd::parse("  TOGGLE\n"), Some(TrayCmd::Toggle));
        assert_eq!(TrayCmd::parse("Ptt-Start"), Some(TrayCmd::PttStart));
        assert_eq!(TrayCmd::parse(""), None);
        assert_eq!(TrayCmd::parse("ptt"), None);
        assert_eq!(TrayCmd::parse("toggle extra"), None);
    }

    #[test]
    fn socket_lives_in_data_dir() {
        assert_eq!(
            socket_path(),
            crate::notes::data_dir().join("tray-ctl.sock")
        );
    }

    #[cfg(unix)]
    #[test]
    fn send_reaches_a_bound_socket() {
        // Bind our own receiver at a scratch path and send to it directly
        // (avoids touching OTOJI_DATA_DIR, which other tests read).
        let dir = std::env::temp_dir().join(format!("otoji-ctl-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("tray-ctl.sock");
        let _ = std::fs::remove_file(&path);
        let rx = std::os::unix::net::UnixDatagram::bind(&path).unwrap();
        let tx = std::os::unix::net::UnixDatagram::unbound().unwrap();
        tx.send_to(TrayCmd::PttEnd.as_str().as_bytes(), &path)
            .unwrap();
        let mut buf = [0u8; 64];
        let n = rx.recv(&mut buf).unwrap();
        assert_eq!(
            TrayCmd::parse(std::str::from_utf8(&buf[..n]).unwrap()),
            Some(TrayCmd::PttEnd)
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
