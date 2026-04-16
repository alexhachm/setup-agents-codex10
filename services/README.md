# Daemon Mode Service Files

Service files for running mac10 as a persistent daemon on Linux (systemd) or macOS (launchd).

## Linux (systemd)

```bash
# Install coordinator service
sudo cp services/mac10-coordinator.service /etc/systemd/system/mac10-coordinator@.service
sudo systemctl daemon-reload

# Configure for your user (replace YOUR_USER)
sudo systemctl enable --now mac10-coordinator@YOUR_USER

# Install research driver (optional, requires coordinator)
sudo cp services/mac10-research.service /etc/systemd/system/mac10-research@.service
sudo systemctl enable --now mac10-research@YOUR_USER

# Check status
systemctl status mac10-coordinator@YOUR_USER
journalctl -u mac10-coordinator@YOUR_USER -f
```

### Configuration

Override defaults in `/etc/systemd/system/mac10-coordinator@.service.d/override.conf`:

```ini
[Service]
Environment=MAC10_PROJECT_DIR=/path/to/your/project
Environment=MAC10_NAMESPACE=my-project
```

## macOS (launchd)

```bash
# Edit plist files to set your project path (replace /Users/YOU/project)
vim services/com.mac10.coordinator.plist

# Install
cp services/com.mac10.coordinator.plist ~/Library/LaunchAgents/
cp services/com.mac10.research.plist ~/Library/LaunchAgents/

# Load
launchctl load ~/Library/LaunchAgents/com.mac10.coordinator.plist
launchctl load ~/Library/LaunchAgents/com.mac10.research.plist

# Check status
launchctl list | grep mac10

# Logs
tail -f /tmp/mac10-coordinator.log
tail -f /tmp/mac10-research.log

# Stop
launchctl unload ~/Library/LaunchAgents/com.mac10.coordinator.plist
```

## Notes

- The coordinator requires Node.js 22+ and git
- The research driver requires Python 3.12+
- Both services use graceful shutdown (SIGTERM)
- systemd services include security hardening (NoNewPrivileges, ProtectSystem)
- Auto-restart on crash with rate limiting (5 restarts per 5 minutes)
