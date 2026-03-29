#!/usr/bin/env python3
"""
chatgpt-driver.py — Automated ChatGPT research driver using nodriver.

Polls the research queue, sends prompts to ChatGPT, and ingests results.
Uses a persistent Chrome profile for session reuse.
Supports three-tier model routing (standard/thinking/deep_research) and
multi-turn follow-up conversations.

Usage:
    python3 chatgpt-driver.py              # Normal operation (poll queue)
    python3 chatgpt-driver.py --setup      # First-run: open browser for manual login
    python3 chatgpt-driver.py --test       # Test: verify login, send test message
"""

import asyncio
import enum
import json
import logging
import os
import random
import re
import subprocess
import sys
import time
from pathlib import Path
try:
    import fcntl
except ImportError:  # pragma: no cover - non-Unix fallback
    fcntl = None

try:
    import nodriver as uc
    import nodriver.cdp as cdp_mod
except ImportError:
    print("ERROR: nodriver not installed. Run: pip install nodriver", file=sys.stderr)
    sys.exit(1)

try:
    import websockets
except ImportError:
    websockets = None

# --- Configuration ---
SCRIPT_DIR = Path(__file__).parent.resolve()
# Support both .codex/scripts/ (2 levels deep) and scripts/ (1 level deep)
if SCRIPT_DIR.name == "scripts" and (SCRIPT_DIR.parent / ".codex").is_dir():
    PROJECT_DIR = SCRIPT_DIR.parent
elif SCRIPT_DIR.name == "scripts" and SCRIPT_DIR.parent.name == ".codex":
    PROJECT_DIR = SCRIPT_DIR.parent.parent
else:
    PROJECT_DIR = SCRIPT_DIR.parent.parent
# Per-project Chrome profile to allow simultaneous multi-project research drivers.
# Falls back to the global profile if PROJECT_DIR cannot be hashed.
import hashlib as _hashlib
_project_hash = _hashlib.sha256(str(PROJECT_DIR).encode()).hexdigest()[:12]
PROFILE_DIR = Path.home() / f".chatgpt-codex-profile-{_project_hash}"
HEALTH_FILE = PROJECT_DIR / ".codex" / "state" / "codex10.agent-health.json"
LOG_FILE = PROJECT_DIR / ".codex" / "logs" / "research-driver.log"
_CODEX10_CLAUDE = PROJECT_DIR / ".claude" / "scripts" / "codex10"
_CODEX10_CODEX = PROJECT_DIR / ".codex" / "scripts" / "codex10"
CODEX10_CMD = _CODEX10_CLAUDE if _CODEX10_CLAUDE.exists() else _CODEX10_CODEX
LOCK_FILE = PROJECT_DIR / ".codex" / "state" / "research-driver.lock"

# Chrome binary — prefer Linux-native Chrome (works with nodriver in WSL),
# fall back to Windows Chrome only if no Linux Chrome available.
CHROME_PATHS_LINUX = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
]
CHROME_PATHS_WINDOWS = [
    "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
    "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe",
]

def _find_chrome():
    import shutil
    # Prefer Linux-native Chrome first
    for p in CHROME_PATHS_LINUX:
        if Path(p).exists():
            return str(p)
    # Check PATH for linux chrome
    for name in ["google-chrome", "google-chrome-stable", "chromium-browser", "chromium"]:
        found = shutil.which(name)
        if found:
            return found
    # Fall back to Windows Chrome
    for p in CHROME_PATHS_WINDOWS:
        if Path(p).exists():
            return str(p)
    return None

def _is_wsl():
    """Detect if running inside WSL."""
    try:
        with open("/proc/version", "r") as f:
            return "microsoft" in f.read().lower()
    except Exception:
        return False

def _wsl_to_windows_path(linux_path):
    """Convert a /mnt/c/... path to C:\\... for Windows executables."""
    s = str(linux_path)
    if s.startswith("/mnt/") and len(s) > 6 and s[5].isalpha() and s[6] == "/":
        drive = s[5].upper()
        return drive + ":\\" + s[7:].replace("/", "\\")
    return s

IS_WSL = _is_wsl()
CHROME_BINARY = _find_chrome()

def _detect_display_mode():
    """Detect display mode: 'xvfb', 'headed', or 'none'."""
    display = os.environ.get("DISPLAY", "")
    if "xvfb" in os.environ.get("XAUTHORITY", "").lower() or os.environ.get("XVFB_RUNNING") == "1":
        return "xvfb"
    if display:
        return "headed"
    return "none"

DISPLAY_MODE = _detect_display_mode()

# Queue polling
POLL_INTERVAL_SEC = 20

# Follow-up conversation limits
MAX_FOLLOW_UPS = 3

# Tab Pool
POOL_MIN_TABS = 5
POOL_MAX_TABS = 10
POOL_RESIZE_INTERVAL_SEC = 30 * 60   # Pick new random target every ~30 min
TAB_CLOSE_DELAY_MIN = 60             # Min seconds a completed tab lingers
TAB_CLOSE_DELAY_MAX = 300            # Max seconds before tab closes
TAB_OPEN_STAGGER = 3                 # Seconds between opening new tabs

# Typing simulation
TYPE_DELAY_MIN = 0.03
TYPE_DELAY_MAX = 0.08
PUNCTUATION_PAUSE_MIN = 0.1
PUNCTUATION_PAUSE_MAX = 0.3
ACTION_DELAY_MIN = 0.2
ACTION_DELAY_MAX = 1.0

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(str(LOG_FILE), mode="a"),
    ],
)
log = logging.getLogger("chatgpt-driver")


# --- Exception Classes ---

class PageStateError(Exception):
    """Page connection lost or too many consecutive evaluate failures."""
    pass


class PageEvaluateError(Exception):
    """Transient JS evaluate failure — retry next tick."""
    pass


# --- Response State Machine Enum ---

class ResponseState(enum.Enum):
    IDLE = "idle"
    WAITING_FOR_START = "waiting_for_start"
    STREAMING = "streaming"
    STABILIZING = "stabilizing"
    COLLECTING = "collecting"
    DONE = "done"


class TabSlotState(enum.Enum):
    OPENING = "opening"
    IDLE = "idle"
    FOCUSING = "focusing"
    WAITING_RESPONSE = "waiting_response"
    NEEDS_FOLLOWUP = "needs_followup"
    DONE_LINGERING = "done_lingering"
    CLOSING = "closing"


class TabSlot:
    """Represents a single browser tab in the pool."""

    def __init__(self, slot_id):
        self.slot_id = slot_id
        self.page = None
        self.monitor = None
        self.state = TabSlotState.OPENING
        self.item = None
        self.composed = None
        self.follow_up_round = 0
        self._current_model = "standard"
        self.linger_until = 0
        self._task = None  # asyncio.Task for per-item lifecycle

    @property
    def is_active(self):
        return self.state in (
            TabSlotState.FOCUSING,
            TabSlotState.WAITING_RESPONSE,
            TabSlotState.NEEDS_FOLLOWUP,
        )

    @property
    def is_closeable(self):
        return self.state in (TabSlotState.IDLE, TabSlotState.DONE_LINGERING)

    def reset_for_new_item(self):
        self.item = None
        self.composed = None
        self.follow_up_round = 0
        self._current_model = "standard"
        self.linger_until = 0
        self._task = None

    def __repr__(self):
        return f"<TabSlot {self.slot_id} state={self.state.value} item={getattr(self.item, 'get', lambda k, d=None: d)('id', None) if self.item else None}>"


def _discover_github_repo():
    """Discover the GitHub repo URL from git remote origin.

    Returns 'owner/repo' string or empty string if not discoverable.
    """
    try:
        result = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            capture_output=True, text=True, timeout=5,
            cwd=str(PROJECT_DIR),
        )
        remote_url = result.stdout.strip()
        if not remote_url:
            return ""
        # HTTPS: https://github.com/owner/repo.git
        m = re.match(r'https?://github\.com/([^/]+/[^/]+?)(?:\.git)?$', remote_url)
        if m:
            return m.group(1)
        # SSH: git@github.com:owner/repo.git
        m = re.match(r'git@github\.com:([^/]+/[^/.]+?)(?:\.git)?$', remote_url)
        if m:
            return m.group(1)
    except Exception as e:
        log.debug(f"GitHub repo discovery failed: {e}")
    return ""

# Discover once at module load
GITHUB_REPO = _discover_github_repo()
if GITHUB_REPO:
    log.info(f"GitHub repo discovered: {GITHUB_REPO}")


def run_codex10(*args):
    """Run a codex10 CLI command and return output."""
    cmd = [str(CODEX10_CMD)] + list(args)
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        return result.stdout.strip(), result.returncode
    except Exception as e:
        log.warning(f"codex10 command failed: {e}")
        return "", 1


def get_next_queued():
    """Get the next queued research item from the coordinator."""
    output, code = run_codex10("research-next")
    if code != 0 or not output:
        return None
    try:
        data = json.loads(output)
        # CLI prints the item directly (unwrapped), or {ok, item} from raw socket
        if "id" in data and "topic" in data:
            return data
        return data.get("item")
    except json.JSONDecodeError:
        return None


def mark_in_progress(item_id):
    """Mark a queue item as in-progress via CLI."""
    _, code = run_codex10("research-start", str(item_id))
    if code == 0:
        log.info(f"Marked item #{item_id} as in_progress")
        return True
    log.warning(f"Failed to mark item #{item_id} as in_progress")
    return False


def compose_prompt(item):
    """Compose a ChatGPT prompt from a queue item.

    Returns {prompt, mode, routing_reasoning} from the composer script.
    Falls back to simple prompt with item's original mode on error.
    """
    # Inject GitHub repo so the composer can include it in prompts
    enriched = dict(item)
    if GITHUB_REPO and not enriched.get("github_repo"):
        enriched["github_repo"] = GITHUB_REPO
    try:
        result = subprocess.run(
            [sys.executable, str(SCRIPT_DIR / "compose-research-prompt.py"), "-"],
            input=json.dumps(enriched),
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            composed = json.loads(result.stdout.strip())
            return composed
        if result.stderr:
            log.warning(f"Prompt composition stderr: {result.stderr.strip()[:300]}")
    except Exception as e:
        log.warning(f"Prompt composition failed: {e}")

    # Fallback: simple prompt with original mode
    return {
        "prompt": f"Research: {item.get('topic', 'unknown')}\n\nQuestion: {item.get('question', '')}",
        "mode": item.get("mode", "standard"),
        "routing_reasoning": "Fallback — composer failed",
    }


def ingest_result(item, response_text, resolved_mode="standard"):
    """Ingest a ChatGPT response into the knowledge system."""
    try:
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT_DIR / "ingest-research.py"),
                "--topic", item.get("topic", "unknown"),
                "--mode", resolved_mode,
                "--question", item.get("question", ""),
            ],
            input=response_text,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            note_path = result.stdout.strip()
            return note_path
    except Exception as e:
        log.error(f"Ingestion failed: {e}")
    return None


def update_health(status="active"):
    """Update agent-health.json with research driver status."""
    try:
        health = {}
        if HEALTH_FILE.exists():
            with open(HEALTH_FILE, "r") as f:
                health = json.load(f)
        if "research-driver" not in health:
            health["research-driver"] = {}
        health["research-driver"]["status"] = status
        health["research-driver"]["last_active"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        with open(HEALTH_FILE, "w") as f:
            json.dump(health, f, indent=2)
    except Exception as e:
        log.warning(f"Health update failed: {e}")


async def human_type(element, text):
    """Type text with human-like delays."""
    for i, char in enumerate(text):
        await element.send_keys(char)
        delay = random.uniform(TYPE_DELAY_MIN, TYPE_DELAY_MAX)
        if char in ".,;:!?":
            delay += random.uniform(PUNCTUATION_PAUSE_MIN, PUNCTUATION_PAUSE_MAX)
        await asyncio.sleep(delay)


async def random_delay():
    """Random micro-delay between actions."""
    await asyncio.sleep(random.uniform(ACTION_DELAY_MIN, ACTION_DELAY_MAX))


# --- BrowserManager ---

_SINGLETON_FILES = ("SingletonLock", "SingletonCookie", "SingletonSocket")


def _clear_stale_profile_locks(profile_dir: Path, force: bool = False):
    """Remove stale Chrome singleton lock artifacts after unclean exits."""
    for name in _SINGLETON_FILES:
        p = profile_dir / name
        if not p.exists() and not p.is_symlink():
            continue
        try:
            if name == "SingletonLock" and p.is_symlink() and not force:
                target = os.readlink(p)
                m = re.search(r"-(\d+)$", target)
                if m and os.path.exists(f"/proc/{m.group(1)}"):
                    # Active chrome owner still exists; keep lock files.
                    continue
            p.unlink()
            log.info(f"Removed stale profile artifact: {p}")
        except Exception as e:
            log.warning(f"Could not remove {p}: {e}")


def _terminate_profile_chrome_processes(profile_dir: Path):
    """Terminate orphaned Chrome processes tied to this driver profile."""
    profile_arg = f"--user-data-dir={profile_dir}"
    try:
        ps = subprocess.run(
            ["ps", "-eo", "pid=,args="],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except Exception as e:
        log.warning(f"Could not inspect running Chrome processes: {e}")
        return

    if ps.returncode != 0:
        return

    stale_pids = []
    for line in ps.stdout.splitlines():
        row = line.strip()
        if not row:
            continue
        parts = row.split(None, 1)
        if len(parts) < 2:
            continue
        try:
            pid = int(parts[0])
        except ValueError:
            continue
        cmd = parts[1]
        if pid == os.getpid():
            continue
        if profile_arg in cmd and "chrome" in cmd.lower():
            stale_pids.append(pid)

    if not stale_pids:
        return

    for pid in stale_pids:
        try:
            os.kill(pid, 15)
        except ProcessLookupError:
            continue
        except Exception as e:
            log.warning(f"Failed to terminate stale Chrome PID {pid}: {e}")
    time.sleep(0.5)
    for pid in stale_pids:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            continue
        except Exception:
            continue
        try:
            os.kill(pid, 9)
        except Exception:
            pass
    log.info(f"Cleaned {len(stale_pids)} stale Chrome process(es) for profile")


def acquire_single_instance_lock():
    """Acquire a process lock so only one research driver runs at a time."""
    if fcntl is None:
        return None
    LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    lock_fp = open(LOCK_FILE, "w")
    try:
        fcntl.flock(lock_fp.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        lock_fp.close()
        return None
    lock_fp.write(str(os.getpid()))
    lock_fp.flush()
    return lock_fp

class BrowserManager:
    """Async context manager guaranteeing browser cleanup.

    Usage:
        async with BrowserManager() as bm:
            page = await bm.new_page("https://chatgpt.com")
            ...  # browser ALWAYS gets cleaned up
    """

    def __init__(self):
        self.browser = None
        self._pages = []

    async def __aenter__(self):
        profile_path = str(PROFILE_DIR)
        using_windows_chrome = IS_WSL and CHROME_BINARY and ".exe" in CHROME_BINARY
        if using_windows_chrome:
            profile_path = _wsl_to_windows_path(PROFILE_DIR)
            log.info(f"WSL detected — using Windows Chrome with profile: {profile_path}")
        else:
            log.info(f"Using Linux Chrome with profile: {profile_path}")

        start_kwargs = {
            "user_data_dir": profile_path,
            "sandbox": False,
            "browser_args": [
                "--disable-background-timer-throttling",
                "--disable-renderer-backgrounding",
                "--disable-backgrounding-occluded-windows",
            ],
        }
        if CHROME_BINARY:
            start_kwargs["browser_executable_path"] = CHROME_BINARY
            log.info(f"Using Chrome: {CHROME_BINARY}")

        last_error = None
        max_attempts = 5
        for attempt in range(1, max_attempts + 1):
            _clear_stale_profile_locks(PROFILE_DIR, force=(attempt > 1))
            if attempt > 1:
                _terminate_profile_chrome_processes(PROFILE_DIR)
            try:
                self.browser = await uc.start(**start_kwargs)
                break
            except Exception as e:
                last_error = e
                wait_s = min(8, attempt * 2)
                log.warning(
                    f"Browser start attempt {attempt}/{max_attempts} failed: {e}. "
                    f"Retrying in {wait_s}s"
                )
                await asyncio.sleep(wait_s)
        if self.browser is None and last_error is not None:
            raise last_error
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.browser is None:
            return False
        try:
            # Close tracked pages
            for p in self._pages:
                try:
                    await p.close()
                except Exception:
                    pass
            self._pages.clear()
            # Stop the browser process and let transports drain
            try:
                self.browser.stop()
                await asyncio.sleep(0.5)
            except Exception:
                pass
        except Exception as e:
            log.warning(f"Browser cleanup error: {e}")
        finally:
            self.browser = None
        return False  # Don't suppress exceptions

    async def new_page(self, url):
        """Open a brand-new tab and navigate to url."""
        page = await self.browser.get(url, new_tab=True)
        self._pages.append(page)
        await asyncio.sleep(3)  # Let the page load
        return page

    async def get_page(self, url):
        """Navigate browser to url (may reuse an existing active tab)."""
        page = await self.browser.get(url)
        if page not in self._pages:
            self._pages.append(page)
        await asyncio.sleep(2)
        return page

    def is_page_valid(self, page):
        """Test if page connection is still live."""
        try:
            return page is not None and not getattr(page, 'closed', False)
        except Exception:
            return False


# --- PageMonitor ---

# The JS snippet injected into the page to track ChatGPT state via MutationObserver.
_MONITOR_JS = """
(() => {
    if (window.__cgpt_observer) return;  // Already injected

    window.__cgpt_state = {
        assistantMessageCount: 0,
        lastAssistantText: '',
        lastAssistantTextChangedAt: Date.now(),
        isStreaming: false,
        stopButtonVisible: false,
        textareaEnabled: false,
        sendButtonVisible: false,
        deepResearchActive: false,
        deepResearchPhase: 'none',
    };

    function updateState() {
        const s = window.__cgpt_state;
        const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
        s.assistantMessageCount = msgs.length;

        const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
        const newText = lastMsg ? (lastMsg.innerText || '') : '';
        if (newText !== s.lastAssistantText) {
            s.lastAssistantText = newText;
            s.lastAssistantTextChangedAt = Date.now();
        }

        // Primary streaming indicator: result-streaming CSS class
        s.isStreaming = !!document.querySelector('.result-streaming');

        // Secondary: stop/cancel button
        s.stopButtonVisible = !!(
            document.querySelector('button[aria-label="Stop generating"]')
            || document.querySelector('button[aria-label="Stop reasoning"]')
            || document.querySelector('button[data-testid="stop-button"]')
        );

        // Input readiness — multiple selectors for ChatGPT UI variations
        const textarea = document.querySelector('textarea, [contenteditable="true"]');
        s.textareaEnabled = textarea ? !textarea.disabled : false;
        s.sendButtonVisible = !!(
            document.querySelector('button[data-testid="send-button"]')
            || document.querySelector('button[data-testid="composer-send-button"]')
            || document.querySelector('button[aria-label="Send prompt"]')
            || document.querySelector('button[aria-label="Send"]')
        );
        // Broader input readiness: textarea present and not disabled
        s.inputReady = s.sendButtonVisible || (s.textareaEnabled && !s.stopButtonVisible && !s.isStreaming);

        // Deep Research detection — DR uses an iframe, not assistant messages
        const drIframe = document.querySelector(
            'iframe[title*="deep-research"], iframe[title*="Deep Research"], '
            + 'iframe[src*="deep_research"], iframe[src*="deep-research"]'
        );
        s.deepResearchIframe = !!drIframe;
        if (drIframe) {
            s.deepResearchActive = true;
            // DR phases inferred from page state:
            // - "working": iframe exists but input not ready (DR still processing)
            // - "complete": iframe exists and input becomes ready (user can type again)
            s.deepResearchPhase = s.inputReady ? 'complete' : 'working';
            // Track iframe height as a rough progress indicator
            s.deepResearchIframeHeight = drIframe.offsetHeight || 0;
        } else {
            // If no iframe found but input is ready and we have conversation turns,
            // DR may have completed and the iframe was removed
            const drSidebar = document.querySelector('[data-testid*="deep-research"]');
            s.deepResearchActive = false;
            s.deepResearchPhase = 'none';
        }

        // Count conversation turns (works for both standard and DR)
        const turns = document.querySelectorAll('[data-testid^="conversation-turn-"]');
        s.conversationTurnCount = turns.length;
    }

    // Initial state
    updateState();

    // Observe DOM mutations
    window.__cgpt_observer = new MutationObserver(() => { updateState(); });
    window.__cgpt_observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class', 'disabled', 'aria-label', 'data-testid'],
    });
})();
"""


class PageMonitor:
    """Reads ChatGPT page state via an injected MutationObserver.

    Injects once, then each get_state() call reads window.__cgpt_state.
    Raises PageStateError after MAX_CONSECUTIVE_FAILURES consecutive failures.
    """

    MAX_CONSECUTIVE_FAILURES = 5

    def __init__(self, page):
        self.page = page
        self._injected = False
        self._consecutive_failures = 0

    async def inject(self):
        """Inject the MutationObserver JS into the page."""
        try:
            await self.page.evaluate(_MONITOR_JS)
            self._injected = True
            self._consecutive_failures = 0
            log.info("PageMonitor: MutationObserver injected")
        except Exception as e:
            raise PageStateError(f"Failed to inject monitor: {e}")

    async def get_state(self):
        """Read the current page state. Returns a dict.

        Raises PageStateError if page is gone or too many consecutive failures.
        Raises PageEvaluateError on a transient failure (caller should retry).
        """
        if not self._injected:
            await self.inject()

        try:
            raw = await self.page.evaluate("JSON.stringify(window.__cgpt_state)")
            if raw is None or raw == "null" or raw == "undefined":
                # Observer was wiped (page navigated?) — re-inject
                self._injected = False
                await self.inject()
                raw = await self.page.evaluate("JSON.stringify(window.__cgpt_state)")

            state = json.loads(raw) if isinstance(raw, str) else raw
            # Defensive: if nodriver returns a list of pairs, convert to dict
            if isinstance(state, list):
                state = dict(state) if state and isinstance(state[0], (list, tuple)) else {}

            self._consecutive_failures = 0
            return state
        except Exception as e:
            self._consecutive_failures += 1
            if self._consecutive_failures >= self.MAX_CONSECUTIVE_FAILURES:
                raise PageStateError(
                    f"Page state unavailable after {self._consecutive_failures} failures: {e}"
                )
            raise PageEvaluateError(f"Transient evaluate error: {e}")

    async def get_last_text(self):
        """Convenience: get the last assistant message text."""
        state = await self.get_state()
        return state.get("lastAssistantText", "")

    async def get_all_response_text(self):
        """Collect ALL assistant messages concatenated."""
        try:
            text = await self.page.evaluate("""
                (() => {
                    const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
                    return Array.from(msgs).map(m => m.innerText).join('\\n\\n---\\n\\n');
                })()
            """)
            return text or ""
        except Exception:
            return ""


async def check_logged_in(page):
    """Check if we're logged into ChatGPT."""
    try:
        textarea = await page.find("textarea", timeout=10)
        return textarea is not None
    except Exception:
        return False


# async def check_rate_limit(page):
#     """Check if we hit a rate limit."""
#     try:
#         body_text = await page.evaluate("document.body.innerText")
#         if "You've reached the limit" in body_text or "rate limit" in body_text.lower():
#             return True
#     except Exception:
#         pass
#     return False


# --- ResponseDetector State Machine ---

# Error message patterns to reject as invalid responses
_ERROR_PATTERNS = [
    "something went wrong",
    "an error occurred",
    "network error",
    "unable to generate",
    "please try again",
    "i'm unable to",
    "i cannot fulfill",
    "conversation not found",
]

# JS to extract clean text from the Deep Research nested iframe.
# Runs inside the sandbox iframe context. Accesses the #root iframe's
# contentDocument (same-origin because of allow-same-origin sandbox flag),
# then extracts text starting from the first heading to skip the animated
# counter header ("Research completed in Xm · N citations · M searches").
_DR_EXTRACT_JS = """
(function() {
    try {
        var root = document.getElementById('root');
        if (!root || !root.contentDocument || !root.contentDocument.body) {
            return '';
        }
        var doc = root.contentDocument;
        // Find the report container (class contains _reportPage_)
        var report = doc.querySelector('[class*="_reportPage_"]') || doc.body;
        var children = report.children;
        var text = '';
        var collecting = false;
        for (var i = 0; i < children.length; i++) {
            var tag = children[i].tagName.toLowerCase();
            if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
                collecting = true;
            }
            if (collecting) {
                text += children[i].innerText + '\\n\\n';
            }
        }
        return text || doc.body.innerText || '';
    } catch(e) {
        return '';
    }
})()
"""

# Mode-specific configuration
_MODE_CONFIG = {
    "standard": {
        "start_timeout": 45,
        "generation_timeout": 480,
        "streaming_timeout": 180,
        "stability_duration": 6.0,
        "poll_interval": 1.5,
        "min_response_length": 20,
    },
    "thinking": {
        "start_timeout": 90,
        "generation_timeout": 900,
        "streaming_timeout": 300,
        "stability_duration": 8.0,
        "poll_interval": 2.0,
        "min_response_length": 1,
    },
    "deep_research": {
        "start_timeout": 300,
        "generation_timeout": 3600,
        "streaming_timeout": 1800,
        "stability_duration": 20.0,
        "poll_interval": 8.0,
        "min_response_length": 200,
    },
}


class ResponseDetector:
    """State machine for detecting when ChatGPT finishes responding.

    States: IDLE → WAITING_FOR_START → STREAMING → STABILIZING → COLLECTING → DONE

    Uses time-based text stability from the JS-side lastAssistantTextChangedAt
    timestamp rather than count-based polling.
    """

    def __init__(self, monitor, mode="standard", initial_msg_count=0):
        self.monitor = monitor
        self.mode = mode
        self.config = _MODE_CONFIG.get(mode, _MODE_CONFIG["standard"])
        self.initial_msg_count = initial_msg_count
        self.state = ResponseState.IDLE
        self._state_entered_at = time.time()
        self._last_log_state = None

    def _transition(self, new_state):
        if new_state != self.state:
            log.info(f"ResponseDetector: {self.state.value} → {new_state.value}")
            self.state = new_state
            self._state_entered_at = time.time()

    def _time_in_state(self):
        return time.time() - self._state_entered_at

    def _is_streaming(self, s):
        """Check if any streaming indicator is active."""
        return s.get("isStreaming", False) or s.get("stopButtonVisible", False)

    def _is_input_ready(self, s):
        """Check if the input area is ready for new messages."""
        return s.get("textareaEnabled", False) or s.get("sendButtonVisible", False)

    def _validate_response(self, text):
        """Check if response text is valid (not an error/placeholder)."""
        if not text or len(text.strip()) < self.config["min_response_length"]:
            return False, "Response too short"
        text_lower = text.lower()
        for pattern in _ERROR_PATTERNS:
            if pattern in text_lower and len(text) < 200:
                return False, f"Error pattern detected: {pattern}"
        return True, "OK"

    async def wait_for_response(self):
        """Run the state machine until DONE or timeout. Returns (success, text)."""
        self._transition(ResponseState.WAITING_FOR_START)
        deadline = time.time() + self.config["generation_timeout"]

        while self.state != ResponseState.DONE:
            if time.time() > deadline:
                log.warning(f"ResponseDetector: timed out in {self.state.value}")
                # If we have content, try to use it
                try:
                    text = await self.monitor.get_last_text()
                    if text and len(text.strip()) > self.config["min_response_length"]:
                        log.warning("Timed out but have usable content — accepting")
                        return True, text
                except Exception:
                    pass
                return False, "Response timeout"

            try:
                s = await self.monitor.get_state()
            except PageEvaluateError:
                await asyncio.sleep(self.config["poll_interval"])
                continue
            except PageStateError as e:
                return False, str(e)

            update_health("processing")

            if self.state == ResponseState.WAITING_FOR_START:
                self._handle_waiting(s)
            elif self.state == ResponseState.STREAMING:
                self._handle_streaming(s)
            elif self.state == ResponseState.STABILIZING:
                self._handle_stabilizing(s)
            elif self.state == ResponseState.COLLECTING:
                return await self._handle_collecting()

            # Check start timeout separately
            if (self.state == ResponseState.WAITING_FOR_START
                    and self._time_in_state() > self.config["start_timeout"]):
                log.warning("ResponseDetector: start timeout — no response began")
                return False, "No response started"

            await asyncio.sleep(self.config["poll_interval"])

        # Should not reach here, but just in case
        return await self._handle_collecting()

    def _handle_waiting(self, s):
        """WAITING_FOR_START: look for any sign of response generation."""
        # New assistant message appeared
        if s.get("assistantMessageCount", 0) > self.initial_msg_count:
            self._transition(ResponseState.STREAMING)
            return

        # Streaming indicators active
        if self._is_streaming(s):
            self._transition(ResponseState.STREAMING)
            return

        # Deep Research: iframe appeared or turn count increased = started
        if self.mode == "deep_research":
            if s.get("deepResearchIframe", False):
                log.info("Deep Research iframe detected — DR is working")
                self._transition(ResponseState.STREAMING)
                return
            if s.get("conversationTurnCount", 0) > 1:
                self._transition(ResponseState.STREAMING)
                return

    def _handle_streaming(self, s):
        """STREAMING: generation in progress, watch for it to stop."""
        # Standard modes: check streaming indicators
        if self.mode != "deep_research":
            if self._is_streaming(s):
                stream_timeout = self.config.get("streaming_timeout", 300)
                if self._time_in_state() > stream_timeout:
                    log.warning(
                        "ResponseDetector: streaming timeout "
                        f"({self._time_in_state():.1f}s) — forcing collection"
                    )
                    self._transition(ResponseState.COLLECTING)
                return
            self._transition(ResponseState.STABILIZING)
            return

        # Deep Research mode: stay streaming while phase is "working"
        dr_phase = s.get("deepResearchPhase", "none")
        if dr_phase == "working":
            # Fallback: if input is ready despite "working" phase, DR may have
            # completed but iframe title selector didn't match the completion state
            if s.get("inputReady", False) and self._time_in_state() > 60:
                log.info("DR input ready while 'working' — treating as complete")
                self._transition(ResponseState.COLLECTING)
            return  # Still processing — stay in STREAMING

        if dr_phase == "complete":
            log.info("Deep Research complete (input ready)")
            self._transition(ResponseState.COLLECTING)
            return

        # DR iframe gone but no completion — possible page nav, keep waiting
        if s.get("deepResearchIframe", False):
            # Iframe present but phase unknown — if input is ready, treat as done
            if s.get("inputReady", False) and self._time_in_state() > 60:
                log.info("DR iframe present + input ready — treating as complete")
                self._transition(ResponseState.COLLECTING)
            return  # Iframe still there, just unknown phase

        # No iframe — DR may have completed and iframe was removed
        if s.get("inputReady", False) and self._time_in_state() > 60:
            log.info("DR iframe gone + input ready — DR likely completed")
            self._transition(ResponseState.COLLECTING)
            return

        # No iframe and no DR signals — something changed, move to stabilizing
        self._transition(ResponseState.STABILIZING)

    def _handle_stabilizing(self, s):
        """STABILIZING: streaming stopped, wait for text to be stable."""
        # If streaming resumes, go back
        if self._is_streaming(s):
            self._transition(ResponseState.STREAMING)
            return

        # Deep Research: if iframe reappears or DR is working, go back
        if self.mode == "deep_research":
            dr_phase = s.get("deepResearchPhase", "none")
            if dr_phase == "working":
                self._transition(ResponseState.STREAMING)
                return
            if dr_phase == "complete":
                self._transition(ResponseState.COLLECTING)
                return

        # Check time-based stability using JS-side timestamp
        last_changed = s.get("lastAssistantTextChangedAt", 0)
        # JS timestamp is in milliseconds
        seconds_since_change = (time.time() * 1000 - last_changed) / 1000.0

        if seconds_since_change >= self.config["stability_duration"]:
            # Text has been stable long enough
            if self._is_input_ready(s):
                log.info(
                    f"Text stable for {seconds_since_change:.1f}s and input ready"
                )
                self._transition(ResponseState.COLLECTING)
            elif seconds_since_change >= self.config["stability_duration"] * 2:
                # Extra stable — accept even without input readiness
                log.info(
                    f"Text very stable ({seconds_since_change:.1f}s) — accepting without input signal"
                )
                self._transition(ResponseState.COLLECTING)

    async def _handle_collecting(self):
        """COLLECTING: validate and return the response."""
        self._transition(ResponseState.DONE)

        # Final DOM stabilization
        await asyncio.sleep(2)

        # Deep Research: text is inside a cross-origin iframe, use copy button
        if self.mode == "deep_research":
            text = await self._collect_dr_text()
        else:
            try:
                text = await self.monitor.get_last_text()
            except Exception as e:
                return False, f"Failed to collect response: {e}"

        valid, reason = self._validate_response(text)
        if not valid:
            log.warning(f"Response validation failed: {reason}")
            return True, text

        log.info(f"Response collected: {len(text)} chars")
        return True, text

    async def _collect_dr_text(self):
        """Extract Deep Research response from the cross-origin sandbox iframe.

        DR content lives inside a nested iframe structure:
          chatgpt.com page
            → iframe: connector_openai_deep_research.web-sandbox.oaiusercontent.com (sandbox)
              → iframe#root: about:blank (same-origin with sandbox, contains the report)

        We use CDP Target.attachToTarget on a SECOND WebSocket to the page's
        debug endpoint, then Runtime.evaluate in the sandbox context to read
        document.getElementById('root').contentDocument — which is accessible
        because the inner iframe has allow-same-origin.
        """
        page = self.monitor.page

        # Method 1: CDP iframe access (primary)
        text = await self._collect_dr_text_cdp(page)
        if text and len(text.strip()) >= self.config.get("min_response_length", 200):
            return text.strip()

        # Method 2: Clipboard fallback
        text = await self._collect_dr_text_clipboard(page)
        if text and len(text.strip()) > 10:
            return text.strip()

        log.warning("Could not extract Deep Research response text")
        return ""

    async def _collect_dr_text_cdp(self, page):
        """Extract DR text via CDP session targeting the sandbox iframe."""
        if websockets is None:
            log.warning("websockets package not installed, skipping CDP extraction")
            return ""

        ws_url = getattr(page, 'websocket_url', None)
        if not ws_url:
            log.warning("No websocket_url on page, skipping CDP extraction")
            return ""

        try:
            # Find the DR sandbox iframe target
            targets = await page.send(cdp_mod.target.get_targets())
            dr_target_id = None
            for t in targets:
                if 'connector_openai' in t.url and 'deep_research' in t.url:
                    dr_target_id = str(t.target_id)
                    break

            if not dr_target_id:
                log.warning("No DR iframe target found in CDP targets")
                return ""

            # Open a second websocket to the page's debug endpoint and
            # attach + evaluate there (avoids conflict with nodriver's listener)
            async with websockets.connect(ws_url, max_size=50_000_000) as ws:
                # Attach to the sandbox iframe on this connection
                result = await self._cdp_send(ws, "Target.attachToTarget", {
                    "targetId": dr_target_id,
                    "flatten": True,
                })
                session_id = result.get("sessionId", "")
                if not session_id:
                    log.warning("No session ID from attachToTarget")
                    return ""

                # Extract clean text: skip the animated counter header,
                # start from the first <h1> in the report container
                result = await self._cdp_send(ws, "Runtime.evaluate", {
                    "expression": _DR_EXTRACT_JS,
                    "returnByValue": True,
                }, session_id=session_id)
                text = result.get("result", {}).get("value", "")
                if text and len(text) > 50:
                    log.info(f"DR text extracted via CDP: {len(text)} chars")
                    return text

                # Fallback: get raw innerText from the nested iframe
                result = await self._cdp_send(ws, "Runtime.evaluate", {
                    "expression": """
                    (function() {
                        try {
                            var root = document.getElementById('root');
                            if (root && root.contentDocument && root.contentDocument.body) {
                                return root.contentDocument.body.innerText || '';
                            }
                        } catch(e) {}
                        return document.body ? document.body.innerText : '';
                    })()
                    """,
                    "returnByValue": True,
                }, session_id=session_id)
                text = result.get("result", {}).get("value", "")
                if text:
                    log.info(f"DR text extracted via CDP (raw): {len(text)} chars")
                return text

        except Exception as e:
            log.warning(f"CDP DR extraction failed: {e}")
            return ""

    @staticmethod
    async def _cdp_send(ws, method, params=None, session_id=None):
        """Send a CDP command on a websocket and wait for matching response."""
        msg_id = random.randint(100000, 999999)
        cmd = {"id": msg_id, "method": method}
        if params:
            cmd["params"] = params
        if session_id:
            cmd["sessionId"] = session_id
        await ws.send(json.dumps(cmd))
        while True:
            resp_raw = await asyncio.wait_for(ws.recv(), timeout=30)
            resp = json.loads(resp_raw)
            if resp.get("id") == msg_id:
                if "error" in resp:
                    raise RuntimeError(f"CDP {method}: {resp['error']}")
                return resp.get("result", {})

    async def _collect_dr_text_clipboard(self, page):
        """Fallback: try copy button + clipboard."""
        try:
            copy_btn = await page.find(
                '[data-testid="copy-turn-action-button"]', timeout=5
            )
            if copy_btn:
                await copy_btn.click()
                await asyncio.sleep(1)
                text = await page.evaluate("navigator.clipboard.readText()")
                if text and len(text.strip()) > 10:
                    log.info(f"DR text via clipboard: {len(text)} chars")
                    return text.strip()
        except Exception as e:
            log.warning(f"Clipboard extraction failed: {e}")
        return ""


# --- Model Selection ---

def _coerce_eval_payload(value):
    """Normalize nodriver evaluate() payloads into a dict."""
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return {}
        if text.startswith("{") or text.startswith("["):
            try:
                parsed = json.loads(text)
            except Exception:
                parsed = None
            if isinstance(parsed, dict):
                return parsed
            if isinstance(parsed, list):
                return {"values": parsed}
        return {"text": text}
    if isinstance(value, list):
        if len(value) == 1 and isinstance(value[0], dict):
            return value[0]
        if len(value) == 1 and isinstance(value[0], str):
            return _coerce_eval_payload(value[0])
        return {"values": value}
    return {}


def _looks_like_pro_option(text):
    t = " ".join(str(text or "").lower().split())
    if t in {"pro", "chatgpt pro", "pro thinking"}:
        return True
    return bool(re.fullmatch(r"o[13]-?pro", t))


async def _get_current_model_label(page):
    """Read the model switcher button text to detect the current model."""
    try:
        label = await page.evaluate("""
            (() => {
                const btn = document.querySelector('[data-testid="model-switcher-dropdown-button"]')
                    || document.querySelector('[data-testid="model-selector"]')
                    || document.querySelector('[aria-label^="Model selector"]');
                return btn ? (btn.innerText || '').trim() : '';
            })()
        """)
        return label or ""
    except Exception:
        return ""


async def _has_composer_pill(page, label):
    """Check if a composer pill (e.g. 'Pro') is already active."""
    try:
        wanted = label.lower()
        result = await page.evaluate(
            f"""
            (() => {{
                const wanted = {wanted!r};
                const norm = (v) => String(v || '').replace(/\\s+/g, ' ').trim().toLowerCase();
                const textboxCandidates = Array.from(
                    document.querySelectorAll('#prompt-textarea, textarea, [contenteditable], [role="textbox"]')
                );
                const textarea = document.querySelector('#prompt-textarea')
                    || textboxCandidates.find((el) => {{
                    if (!el || !el.getClientRects || !el.getClientRects().length) return false;
                    if (el.closest('aside, nav, [data-testid*="sidebar"]')) return false;
                    const aria = norm(el.getAttribute && el.getAttribute('aria-label'));
                    const placeholder = norm(el.getAttribute && el.getAttribute('placeholder'));
                    if (aria.includes('search') || placeholder.includes('search')) return false;
                    const rect = el.getBoundingClientRect();
                    if (rect.width < 240) return false;
                    return true;
                }}) || null;
                const roots = [];
                if (textarea && textarea.closest('form')) roots.push(textarea.closest('form'));
                const composer = document.querySelector('[id*="composer"], [class*="composer"]');
                if (composer) roots.push(composer);
                if (roots.length === 0) return false;

                const seen = new Set();
                for (const root of roots) {{
                    if (!root || seen.has(root)) continue;
                    seen.add(root);
                    const nodes = root.querySelectorAll(
                        '[class*="pill"], [data-testid*="pill"], '
                        + 'button[aria-pressed="true"], [role="button"][aria-pressed="true"], '
                        + 'button, [role="button"]'
                    );
                    for (const node of nodes) {{
                        const text = norm(node.innerText || node.textContent || '');
                        if (!text) continue;
                        if (text !== wanted && text !== `chatgpt ${{wanted}}`) continue;
                        {{
                            const cls = norm(node.className || '');
                            const dataTest = norm(node.getAttribute && node.getAttribute('data-testid'));
                            const ariaPressed = node.getAttribute && node.getAttribute('aria-pressed') === 'true';
                            const ariaSelected = node.getAttribute && node.getAttribute('aria-selected') === 'true';
                            if (
                                ariaPressed ||
                                ariaSelected ||
                                cls.includes('active') ||
                                cls.includes('selected') ||
                                cls.includes('pill') ||
                                dataTest.includes('pill')
                            ) {{
                                return true;
                            }}
                        }}
                    }}
                }}
                return false;
            }})()
            """
        )
        return bool(result)
    except Exception:
        return False


async def _activate_pro_via_dropdown(page):
    """Click the top-left 'ChatGPT' dropdown and select Pro thinking.

    The current ChatGPT UI shows a 'ChatGPT' label with a dropdown icon in the
    top-left corner.  Clicking it reveals model options including 'ChatGPT Pro'
    or similar.  Returns True if Pro was successfully selected.
    """
    def _open_selector_js():
        return """
        (() => {
            const isVisible = (el) => !!(el && el.isConnected && el.getClientRects().length);
            const textOf = (el) => (el?.innerText || el?.textContent || '').replace(/\\s+/g, ' ').trim();
            const interactiveSelector = 'button,[role="button"],[role="menuitem"],[role="option"],li,div[tabindex],a,label';
            const norm = (s) => String(s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
            const pick = (el) => el ? {
                tag: el.tagName,
                text: textOf(el),
                aria: el.getAttribute('aria-label'),
                testid: el.getAttribute('data-testid'),
                id: el.id || '',
                className: String(el.className || ''),
            } : null;
            const clickLikeUser = (el) => {
                if (!el) return false;
                try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_err) {}
                const dispatch = (Ctor, type) => {
                    if (typeof Ctor !== 'function') return;
                    try { el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true })); } catch (_err) {}
                };
                dispatch(window.PointerEvent, 'pointerdown');
                dispatch(window.MouseEvent, 'mousedown');
                dispatch(window.PointerEvent, 'pointerup');
                dispatch(window.MouseEvent, 'mouseup');
                dispatch(window.MouseEvent, 'click');
                try { el.click(); } catch (_err) {}
                return true;
            };
            const visibleInteractive = (root = document) =>
                [...root.querySelectorAll(interactiveSelector)].filter(isVisible);
            const getBlob = (el) =>
                [
                    textOf(el),
                    el.getAttribute?.('aria-label') || '',
                    el.getAttribute?.('data-testid') || '',
                    el.id || '',
                    String(el.className || ''),
                ].join(' ').replace(/\\s+/g, ' ').trim().toLowerCase();
            const findInteractive = (patterns, root = document) =>
                visibleInteractive(root).find((el) => {
                    const blob = getBlob(el);
                    return patterns.some((rx) => rx.test(blob));
                });
            const modelSelector =
                document.querySelector('button[data-testid="model-switcher-dropdown-button"]')
                || findInteractive([/model selector/, /\\bchatgpt\\b/, /\\bmodel\\b/]);
            if (!modelSelector) return JSON.stringify({ ok: false, reason: 'no-model-selector' });
            clickLikeUser(modelSelector);
            return JSON.stringify({ ok: true, modelSelector: pick(modelSelector) });
        })()
        """

    def _click_pro_js():
        return """
        (() => {
            const isVisible = (el) => !!(el && el.isConnected && el.getClientRects().length);
            const textOf = (el) => (el?.innerText || el?.textContent || '').replace(/\\s+/g, ' ').trim();
            const interactiveSelector = 'button,[role="button"],[role="menuitem"],[role="option"],li,div[tabindex],a,label';
            const norm = (s) => String(s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
            const pick = (el) => el ? {
                tag: el.tagName,
                text: textOf(el),
                aria: el.getAttribute('aria-label'),
                testid: el.getAttribute('data-testid'),
                id: el.id || '',
                className: String(el.className || ''),
            } : null;
            const clickLikeUser = (el) => {
                if (!el) return false;
                try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_err) {}
                const dispatch = (Ctor, type) => {
                    if (typeof Ctor !== 'function') return;
                    try { el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true })); } catch (_err) {}
                };
                dispatch(window.PointerEvent, 'pointerdown');
                dispatch(window.MouseEvent, 'mousedown');
                dispatch(window.PointerEvent, 'pointerup');
                dispatch(window.MouseEvent, 'mouseup');
                dispatch(window.MouseEvent, 'click');
                try { el.click(); } catch (_err) {}
                return true;
            };
            const visibleInteractive = (root = document) =>
                [...root.querySelectorAll(interactiveSelector)].filter(isVisible);
            const getBlob = (el) =>
                [
                    textOf(el),
                    el.getAttribute?.('aria-label') || '',
                    el.getAttribute?.('data-testid') || '',
                    el.id || '',
                    String(el.className || ''),
                ].join(' ').replace(/\\s+/g, ' ').trim().toLowerCase();
            const findInteractive = (patterns, root = document) =>
                visibleInteractive(root).find((el) => {
                    const blob = getBlob(el);
                    return patterns.some((rx) => rx.test(blob));
                });
            const direct = document.querySelector('[data-testid="model-switcher-gpt-5-4-pro"]');
            const fallback = visibleInteractive().find((el) => {
                const rect = el.getBoundingClientRect();
                if (!rect || rect.left > 720 || rect.top > 520) return false;
                const text = norm(textOf(el));
                const aria = norm(el.getAttribute('aria-label'));
                const testid = norm(el.getAttribute('data-testid'));
                const role = norm(el.getAttribute('role'));
                const cls = norm(el.className || '');
                const hint = `${text} ${aria} ${testid}`;
                if (!hint) return false;
                if (
                    hint.includes('profile')
                    || hint.includes('account')
                    || hint.includes('settings')
                    || hint.includes('open profile menu')
                ) return false;
                const inModelMenu = (
                    testid.includes('model-switcher')
                    || role.includes('menuitem')
                    || role.includes('option')
                    || cls.includes('__menu-item')
                );
                if (!inModelMenu) return false;
                if (testid.includes('model-switcher-gpt-5-4-pro')) return true;
                if (text === 'pro' || text.startsWith('pro ') || text.includes('chatgpt pro') || text.includes('proresearch')) return true;
                return false;
            });
            const target = (direct && isVisible(direct)) ? direct : fallback;
            if (!target) {
                const visibleSample = visibleInteractive().slice(0, 20).map((el) => ({
                    text: textOf(el),
                    aria: el.getAttribute('aria-label'),
                    testid: el.getAttribute('data-testid'),
                    role: el.getAttribute('role'),
                    left: Math.round(el.getBoundingClientRect().left),
                    top: Math.round(el.getBoundingClientRect().top),
                }));
                return JSON.stringify({ ok: false, reason: 'no-pro-option', visibleSample });
            }
            clickLikeUser(target);
            return JSON.stringify({ ok: true, pro: pick(target) });
        })()
        """

    def _verify_js():
        return """
        (() => {
            const isVisible = (el) => !!(el && el.isConnected && el.getClientRects().length);
            const textOf = (el) => (el?.innerText || el?.textContent || '').replace(/\\s+/g, ' ').trim();
            const norm = (s) => String(s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
            const currentLabel = textOf(document.querySelector('button[data-testid="model-switcher-dropdown-button"]'));
            const hasComposerPro = [...document.querySelectorAll('button,[role="button"],span,div')]
                .filter(isVisible)
                .some((el) => {
                    const cls = String(el.className || '');
                    if (!cls.includes('__composer-pill')) return false;
                    return /\\bpro\\b/.test(norm(textOf(el)));
                });
            return JSON.stringify({ ok: true, currentLabel, hasComposerPro });
        })()
        """

    try:
        opened = _coerce_eval_payload(await page.evaluate(_open_selector_js()))
        if not opened.get("ok"):
            log.warning(f"Could not open model selector: {opened}")
            return False
        log.info(f"Model selector clicked: {opened.get('modelSelector')}")
        await asyncio.sleep(0.7)

        pro_click = {}
        for _ in range(40):
            pro_click = _coerce_eval_payload(await page.evaluate(_click_pro_js()))
            if pro_click.get("ok"):
                break
            await asyncio.sleep(0.15)
        if not pro_click.get("ok"):
            log.warning(f"Could not activate Pro via dropdown: {pro_click}")
            try:
                await page.evaluate("document.body.click()")
            except Exception:
                pass
            return False

        log.info(f"Pro option clicked: {pro_click.get('pro')}")
        await asyncio.sleep(0.9)

        verify = _coerce_eval_payload(await page.evaluate(_verify_js()))
        label = await _get_current_model_label(page)
        has_pill = await _has_composer_pill(page, "pro")
        js_verified = bool(verify.get("hasComposerPro")) or "pro" in str(verify.get("currentLabel", "")).lower()
        log.info(
            "Pro verification: "
            f"js_verified={js_verified} "
            f"js_label='{verify.get('currentLabel', '')}' "
            f"js_composer_pro={verify.get('hasComposerPro')} "
            f"model_label='{label}' composer_pill={has_pill}"
        )

        try:
            await page.evaluate("document.body.click()")
        except Exception:
            pass

        if js_verified or "pro" in (label or "").lower() or has_pill:
            log.info("Activated Pro via deterministic selector flow")
            return True

        log.warning("Pro click completed but final verification failed")
        return False
    except Exception as e:
        log.warning(f"Pro dropdown activation failed: {e}")
        try:
            await page.evaluate("document.body.click()")
        except Exception:
            pass
        return False


# Extended thinking budget mapping: mode → desired thinking level
_EXTENDED_THINKING_LEVELS = {
    "thinking": "extended",
    "deep_research": "extended",
    "standard": None,
}


async def _configure_extended_thinking(page, mode):
    """Configure the extended thinking dropdown that appears after Pro is activated.

    Once Pro thinking is active, a dropdown appears in the textbox/composer area
    that allows setting the extended thinking budget.  The level is determined by
    the research mode/allocation.
    """
    desired_level = _EXTENDED_THINKING_LEVELS.get(mode)
    if not desired_level:
        return True  # No configuration needed

    try:
        log.info(f"Extended thinking target level for mode '{mode}': '{desired_level}'")

        find_and_click_pill_js = """
        (() => {
            const isVisible = (el) => !!(el && el.isConnected && el.getClientRects().length);
            const textOf = (el) => (el?.innerText || el?.textContent || '').replace(/\\s+/g, ' ').trim();
            const norm = (s) => String(s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
            const interactiveSelector = 'button,[role="button"],[role="menuitem"],[role="option"],li,div[tabindex],a,label';
            const visibleInteractive = (root = document) =>
                [...root.querySelectorAll(interactiveSelector)].filter(isVisible);
            const pick = (el) => el ? {
                tag: el.tagName,
                text: textOf(el),
                aria: el.getAttribute('aria-label'),
                testid: el.getAttribute('data-testid'),
                id: el.id || '',
                className: String(el.className || ''),
            } : null;
            const getBlob = (el) =>
                [
                    textOf(el),
                    el.getAttribute?.('aria-label') || '',
                    el.getAttribute?.('data-testid') || '',
                    el.id || '',
                    String(el.className || ''),
                ].join(' ').replace(/\\s+/g, ' ').trim().toLowerCase();
            const isRemoveButton = (el) => {
                const aria = norm(el.getAttribute?.('aria-label') || '');
                const cls = String(el.className || '');
                return aria.includes('click to remove') || cls.includes('__composer-pill-remove');
            };
            const isComposerPill = (el) => {
                const cls = String(el.className || '');
                return cls.includes('__composer-pill') && !cls.includes('__composer-pill-remove');
            };
            const clickLikeUser = (el) => {
                if (!el) return false;
                try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_err) {}
                const dispatch = (Ctor, type) => {
                    if (typeof Ctor !== 'function') return;
                    try { el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true })); } catch (_err) {}
                };
                dispatch(window.PointerEvent, 'pointerdown');
                dispatch(window.MouseEvent, 'mousedown');
                dispatch(window.PointerEvent, 'pointerup');
                dispatch(window.MouseEvent, 'mouseup');
                dispatch(window.MouseEvent, 'click');
                try { el.click(); } catch (_err) {}
                return true;
            };
            const findInteractive = (patterns, root = document, reject = null) =>
                visibleInteractive(root).find((el) => {
                    if (reject && reject(el)) return false;
                    const blob = getBlob(el);
                    return patterns.some((rx) => rx.test(blob));
                });
            const effortPill =
                [...document.querySelectorAll('button')].find((el) => {
                    if (!isVisible(el) || isRemoveButton(el)) return false;
                    if (!isComposerPill(el)) return false;
                    const t = norm(textOf(el));
                    return /\\bpro\\b|\\bextended\\b|\\bstandard\\b/.test(t);
                })
                || findInteractive(
                    [/\\bextended pro\\b/, /\\bpro\\b/, /\\bstandard\\b/, /\\bextended\\b/],
                    document,
                    isRemoveButton
                );
            if (!effortPill) {
                const nearby = visibleInteractive().slice(0, 25).map((el) => ({
                    text: textOf(el),
                    aria: el.getAttribute('aria-label'),
                    testid: el.getAttribute('data-testid'),
                    className: String(el.className || ''),
                }));
                return JSON.stringify({ ok: false, reason: 'no-effort-pill', nearby });
            }
            if (!effortPill.dataset.mac10EffortPill) {
                effortPill.dataset.mac10EffortPill = String(Date.now()) + '-' + String(Math.floor(Math.random() * 10000));
            }
            clickLikeUser(effortPill);
            return JSON.stringify({
                ok: true,
                marker: effortPill.dataset.mac10EffortPill,
                effortPill: pick(effortPill),
            });
        })()
        """

        pill_payload = {}
        for _ in range(50):
            pill_payload = _coerce_eval_payload(await page.evaluate(find_and_click_pill_js))
            if pill_payload.get("ok"):
                break
            await asyncio.sleep(0.15)
        if not pill_payload.get("ok"):
            log.warning(
                "Extended thinking selection failed: "
                f"reason='{pill_payload.get('reason')}' desired='{desired_level}' "
                f"nearby={pill_payload.get('nearby')}"
            )
            return False

        marker = str(pill_payload.get("marker") or "")
        log.info(f"Extended thinking control clicked: effort_pill={pill_payload.get('effortPill')}")
        await asyncio.sleep(0.5)

        desired_json = json.dumps(desired_level)
        marker_json = json.dumps(marker)
        select_option_js = f"""
        (() => {{
            const desired = {desired_json};
            const marker = {marker_json};
            const isVisible = (el) => !!(el && el.isConnected && el.getClientRects().length);
            const textOf = (el) => (el?.innerText || el?.textContent || '').replace(/\\s+/g, ' ').trim();
            const norm = (s) => String(s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
            const pick = (el) => el ? {{
                tag: el.tagName,
                text: textOf(el),
                aria: el.getAttribute('aria-label'),
                testid: el.getAttribute('data-testid'),
                id: el.id || '',
                className: String(el.className || ''),
            }} : null;
            const getBlob = (el) =>
                [
                    textOf(el),
                    el.getAttribute?.('aria-label') || '',
                    el.getAttribute?.('data-testid') || '',
                    el.id || '',
                    String(el.className || ''),
                ].join(' ').replace(/\\s+/g, ' ').trim().toLowerCase();
            const clickLikeUser = (el) => {{
                if (!el) return false;
                try {{ el.scrollIntoView({{ block: 'center', inline: 'center' }}); }} catch (_err) {{}}
                const dispatch = (Ctor, type) => {{
                    if (typeof Ctor !== 'function') return;
                    try {{ el.dispatchEvent(new Ctor(type, {{ bubbles: true, cancelable: true }})); }} catch (_err) {{}}
                }};
                dispatch(window.PointerEvent, 'pointerdown');
                dispatch(window.MouseEvent, 'mousedown');
                dispatch(window.PointerEvent, 'pointerup');
                dispatch(window.MouseEvent, 'mouseup');
                dispatch(window.MouseEvent, 'click');
                try {{ el.click(); }} catch (_err) {{}}
                return true;
            }};
            const getLeafMenuItems = (menu) =>
                [
                    ...menu.querySelectorAll('[role="menuitem"],[role="option"],button,[tabindex]'),
                ].filter((el) => isVisible(el) && el !== menu && !el.matches('[role="menu"]'));
            const findLeafMenuItem = (menu, patterns) =>
                getLeafMenuItems(menu).find((el) => {{
                    const blob = getBlob(el);
                    return patterns.some((rx) => rx.test(blob));
                }});

            let effortPill = marker ? document.querySelector(`[data-mac10-effort-pill="${{marker}}"]`) : null;
            if (!effortPill || !isVisible(effortPill)) {{
                effortPill = [...document.querySelectorAll('button,[role="button"]')]
                    .find((el) => isVisible(el) && /\\bpro\\b|\\bextended\\b|\\bstandard\\b/.test(norm(textOf(el))));
            }}
            if (!effortPill) {{
                return JSON.stringify({{ ok: false, reason: 'missing-effort-pill' }});
            }}

            let effortMenu = null;
            const menuId = effortPill.getAttribute('aria-controls');
            if (menuId) {{
                const controlled = document.getElementById(menuId);
                if (controlled && isVisible(controlled)) effortMenu = controlled;
            }}
            if (!effortMenu) {{
                const openMenus = [...document.querySelectorAll('[role="menu"],[role="listbox"],[data-state="open"]')]
                    .filter(isVisible);
                if (openMenus.length) effortMenu = openMenus[0];
            }}
            if (!effortMenu) {{
                clickLikeUser(effortPill);
                return JSON.stringify({{ ok: false, reason: 'menu-not-open', effortPill: pick(effortPill) }});
            }}

            const patterns = desired === 'extended'
                ? [/^extended$/i, /\\bextended\\b/, /\\bextended pro\\b/]
                : [/^standard$/i, /\\bstandard\\b/, /\\bstandard thinking\\b/];

            const option = findLeafMenuItem(effortMenu, patterns);
            const options = getLeafMenuItems(effortMenu).map((el) => ({{
                text: textOf(el),
                aria: el.getAttribute('aria-label'),
                role: el.getAttribute('role'),
                testid: el.getAttribute('data-testid'),
                id: el.id || '',
                className: String(el.className || ''),
            }}));
            if (!option) {{
                return JSON.stringify({{
                    ok: false,
                    reason: 'no-desired-option',
                    desired,
                    effortPill: pick(effortPill),
                    options,
                }});
            }}

            clickLikeUser(option);
            const pillText = textOf(effortPill);
            return JSON.stringify({{
                ok: true,
                desired,
                clicked: textOf(option),
                effortPill: pick(effortPill),
                pillText,
                confirmed: norm(pillText).includes(desired),
                options,
            }});
        }})()
        """

        level_selected = {}
        for _ in range(50):
            level_selected = _coerce_eval_payload(await page.evaluate(select_option_js))
            if level_selected.get("ok"):
                break
            await asyncio.sleep(0.15)
        if not level_selected.get("ok"):
            log.warning(
                "Extended thinking selection failed: "
                f"reason='{level_selected.get('reason')}' desired='{desired_level}' "
                f"effort_pill={level_selected.get('effortPill')} "
                f"options={level_selected.get('options')}"
            )
            try:
                await page.evaluate("document.body.click()")
            except Exception:
                pass
            return False

        log.info(
            "Extended thinking option clicked: "
            f"desired='{desired_level}' clicked='{level_selected.get('clicked', '')}' "
            f"pill_text='{level_selected.get('pillText', '')}' "
            f"confirmed={level_selected.get('confirmed')} "
            f"effort_pill={level_selected.get('effortPill')}"
        )
        options = level_selected.get("options") or []
        if options:
            log.info(f"Extended thinking menu options seen: {options}")

        await asyncio.sleep(0.5)
        confirm_script = f"""
        (() => {{
            const desired = {desired_json};
            const norm = (v) => String(v || '').replace(/\\s+/g, ' ').trim().toLowerCase();
            const isVisible = (el) => !!(el && el.getClientRects && el.getClientRects().length);
            const textOf = (el) => (el?.innerText || el?.textContent || '').replace(/\\s+/g, ' ').trim();
            const labels = document.querySelectorAll('button, span, div, [role="button"]');
            for (const el of labels) {{
                if (!isVisible(el)) continue;
                const text = norm(textOf(el));
                if (!text) continue;
                const cls = String(el.className || '');
                if (cls.includes('__composer-pill') && text.includes(desired)) return text;
            }}
            return '';
        }})()
        """
        confirm = await page.evaluate(confirm_script)
        if confirm:
            log.info(f"Composer thinking label after configuration: '{confirm}'")
            return True
        if level_selected.get("confirmed"):
            log.info("Extended thinking confirmed from effort pill text")
            return True
        log.warning(
            f"Extended thinking post-check failed: desired='{desired_level}' "
            f"pill_text='{level_selected.get('pillText', '')}'"
        )
        return False
    except Exception as e:
        log.warning(f"Extended thinking configuration failed: {e}")
        try:
            await page.evaluate("document.body.click()")
        except Exception:
            pass
        return False


async def select_model(page, mode):
    """Switch ChatGPT's model based on the routing tier.

    Pure function — operates on a given page. Caller tracks model state.

    - standard: default model (no action needed on fresh chat)
    - thinking: activate Pro thinking via top-left dropdown, then configure
      extended thinking budget in the composer area
    - deep_research: click Deep Research in the model switcher
    """
    if mode == "standard":
        return True

    current_label = await _get_current_model_label(page)
    log.info(f"Current model label: '{current_label}'")

    if mode == "thinking":
        # Check if already on a reasoning/Pro model
        label_lower = current_label.lower()
        if any(k in label_lower for k in ("pro", "o1", "o3", "reason")):
            log.info(f"Reasoning model active: '{current_label}'")
            if await _configure_extended_thinking(page, mode):
                return True
            log.warning("Reasoning model active but extended-thinking selection failed")
            return False
        has_pro_pill = await _has_composer_pill(page, "Pro")
        if has_pro_pill:
            log.info("Pro pill detected in composer")
            if "pro" in label_lower:
                if await _configure_extended_thinking(page, mode):
                    return True
                log.warning("Pro label detected but extended-thinking selection failed")
                return False
            log.info("Model label does not confirm Pro; enforcing dropdown Pro selection")

        # Strategy 1: Click the top-left "ChatGPT" dropdown and select Pro
        log.info("Pro not detected — trying top-left ChatGPT dropdown")
        if await _activate_pro_via_dropdown(page):
            if await _configure_extended_thinking(page, mode):
                return True
            log.warning("Pro activated but extended-thinking selection failed")
            return False

        # Strategy 2: Try composer plus button (legacy approach)
        try:
            plus_btn = await page.find('button[data-testid="composer-plus-btn"]', timeout=3)
            if plus_btn:
                await plus_btn.click()
                await random_delay()
                target = await page.find("text=Pro", timeout=3)
                if target:
                    await target.click()
                    await random_delay()
                    log.info("Added Pro pill via composer plus button")
                    if await _configure_extended_thinking(page, mode):
                        return True
                    log.warning("Composer plus added Pro but extended-thinking selection failed")
                    return False
                await page.evaluate("document.body.click()")
        except Exception as e:
            log.warning(f"Composer plus button approach failed: {e}")

        log.warning("Could not activate Pro + extended thinking explicitly")
        return False

    if mode == "deep_research":
        # Strategy 1: Try the top-left dropdown approach (new UI)
        try:
            model_btn = await _find_model_button(page)
            if not model_btn:
                # Try broader search for the ChatGPT dropdown
                model_btn = await page.evaluate("""
                    (() => {
                        for (const btn of document.querySelectorAll('button')) {
                            if ((btn.innerText || '').trim().toLowerCase().includes('chatgpt')) {
                                btn.click();
                                return true;
                            }
                        }
                        return false;
                    })()
                """)
                if model_btn:
                    await asyncio.sleep(1.5)
            else:
                await model_btn.click()
                await asyncio.sleep(1.5)

            # Look for Deep Research in the dropdown/sidebar
            dr_clicked = await page.evaluate("""
                (() => {
                    const selectors = [
                        'a[data-testid*="deep-research"]',
                        '[role="option"]', '[role="menuitem"]', '[role="menuitemradio"]',
                        'a', 'button', 'div[tabindex]', 'li',
                    ];
                    const seen = new Set();
                    for (const sel of selectors) {
                        for (const el of document.querySelectorAll(sel)) {
                            if (seen.has(el)) continue;
                            seen.add(el);
                            const text = (el.innerText || '').trim().toLowerCase();
                            if (text.includes('deep research') || text.includes('deep_research')) {
                                el.click();
                                return text;
                            }
                        }
                    }
                    return null;
                })()
            """)

            if dr_clicked:
                log.info(f"Switched to Deep Research via dropdown: '{dr_clicked}'")
                await asyncio.sleep(3)
                return True

            # Close dropdown
            await page.evaluate("document.body.click()")
        except Exception as e:
            log.warning(f"Deep research dropdown switch failed: {e}")

        # Strategy 2: Legacy direct testid approach
        try:
            dr_link = await page.find('a[data-testid="deep-research-sidebar-item"]', timeout=3)
            if dr_link:
                await dr_link.click()
                await asyncio.sleep(3)
                log.info("Switched to Deep Research mode (legacy selector)")
                return True
        except Exception:
            pass

        log.warning("Could not switch to deep_research mode")
        return False

    log.warning(f"Unknown mode: {mode}")
    return False


async def _find_model_button(page):
    """Locate the model switcher button on the page."""
    for testid in ["model-switcher-dropdown-button", "model-selector"]:
        try:
            btn = await page.find(f'button[data-testid="{testid}"]', timeout=3)
            if btn:
                return btn
        except Exception:
            continue
    try:
        btn = await page.find('button[aria-label^="Model selector"]', timeout=3)
        if btn:
            return btn
    except Exception:
        pass
    try:
        btn = await page.find('button[aria-label*="Model"]', timeout=3)
        if btn:
            return btn
    except Exception:
        pass
    try:
        return await page.find("text=ChatGPT", timeout=3)
    except Exception:
        return None


# --- Follow-Up Conversation Logic ---

HEDGING_PHRASES = [
    "i need more information",
    "i'm not sure",
    "it depends on",
    "i can't determine",
    "without more context",
    "it's unclear",
    "i don't have enough",
    "i would need to know",
]


def evaluate_response(response_text, question):
    """Evaluate if a response needs follow-up.

    Returns None if response is adequate, or a follow-up prompt string.
    """
    if not response_text:
        return None

    text_lower = response_text.lower()

    for phrase in HEDGING_PHRASES:
        if phrase in text_lower:
            return (
                "You mentioned some uncertainty in your response. "
                "Can you provide the most likely correct answer with caveats, "
                "rather than leaving it unresolved? Please be as concrete as possible."
            )

    question_words = len(question.split())
    response_words = len(response_text.split())
    if question_words > 30 and response_words < 100:
        return (
            "This is helpful but I need more depth. Can you expand with "
            "specific implementation details, code examples, and concrete recommendations?"
        )

    question_marks = question.count("?")
    if question_marks >= 3:
        response_paragraphs = [p for p in response_text.split("\n\n") if p.strip()]
        if len(response_paragraphs) < question_marks:
            return (
                "The original question had multiple parts. It looks like some may not have been "
                "fully addressed. Can you review the original question and ensure all parts are covered?"
            )

    return None


async def send_message_in_chat(page, monitor, prompt, mode="standard"):
    """Send a message in the current chat and wait for response using monitor + detector."""
    # Snapshot current assistant message count before sending
    try:
        state = await monitor.get_state()
        initial_msg_count = state.get("assistantMessageCount", 0)
    except (PageStateError, PageEvaluateError):
        initial_msg_count = 0

    textarea = await page.find("textarea", timeout=10)
    if not textarea:
        raise RuntimeError("Cannot find ChatGPT input textarea")

    await textarea.click()
    await random_delay()

    if len(prompt) > 500:
        # Use CDP Input.insertText — bypasses clipboard entirely
        await textarea.send_keys(" ")
        await asyncio.sleep(0.1)
        await textarea.send_keys("\x08")  # Backspace to clear the activation char
        await asyncio.sleep(0.1)
        await page.send(cdp_mod.input_.insert_text(text=prompt))
        await asyncio.sleep(0.5)
    else:
        await human_type(textarea, prompt)

    await random_delay()

    try:
        send_btn = await page.find('button[data-testid="send-button"]', timeout=3)
        if send_btn:
            await send_btn.click()
        else:
            await textarea.send_keys("\n")
    except Exception:
        await textarea.send_keys("\n")

    log.info("Message sent, waiting for response...")

    detector = ResponseDetector(monitor, mode=mode, initial_msg_count=initial_msg_count)
    success, text = await detector.wait_for_response()
    if not success and text == "Response start timeout":
        log.warning("No response start detected after send; retrying send once")
        try:
            retry_btn = await page.find('button[data-testid="send-button"]', timeout=2)
            if retry_btn:
                await retry_btn.click()
            else:
                await textarea.send_keys("\n")
            await random_delay()
            detector = ResponseDetector(monitor, mode=mode, initial_msg_count=initial_msg_count)
            success, text = await detector.wait_for_response()
        except Exception as retry_err:
            log.warning(f"Retry send after start-timeout failed: {retry_err}")

    if success:
        return {"success": True, "text": text}
    else:
        return {"success": False, "error": text}


async def send_message(page, monitor, prompt, mode="standard"):
    """Send initial message, then do follow-up rounds if needed.

    Returns the full concatenated conversation text.
    """
    await select_model(page, mode)

    result = await send_message_in_chat(page, monitor, prompt, mode)
    if not result["success"]:
        return result

    question = prompt
    for follow_up_round in range(MAX_FOLLOW_UPS):
        last_response = result["text"]
        follow_up_prompt = evaluate_response(last_response, question)

        if follow_up_prompt is None:
            break

        log.info(f"Follow-up round {follow_up_round + 1}/{MAX_FOLLOW_UPS}: sending clarification")

        result = await send_message_in_chat(page, monitor, follow_up_prompt, mode)
        if not result["success"]:
            log.warning(f"Follow-up round {follow_up_round + 1} failed, using partial results")
            break

    # Collect ALL assistant messages from the conversation
    full_text = await monitor.get_all_response_text()
    return {"success": True, "text": full_text}


async def select_model_for_slot(slot, mode):
    """Select model for a specific tab slot, tracking per-slot model state."""
    if mode == slot._current_model:
        return True
    result = await select_model(slot.page, mode)
    if result:
        slot._current_model = mode
    return result


class TabPool:
    """Session-based ChatGPT research driver.

    Every ~30 minutes a new session begins with a random N in [5-10].
    N is the max items dispatched that session.  Items are dispatched
    ONE AT A TIME: open a fresh tab, type the prompt, send it, confirm
    it's streaming, then move to the next item.  Multiple tabs wait for
    responses concurrently.  Completed tabs linger 1-5 min before
    closing.  Sequential dispatch means the focus lock is never
    contended during normal operation.
    """

    def __init__(self, bm):
        self.bm = bm
        self.slots = []
        self._next_slot_id = 0
        self._focus_lock = asyncio.Lock()   # safety net for follow-ups
        self._shutdown = False
        # Session state
        self._session_n = 0
        self._session_dispatched = 0
        self._session_start_time = 0.0

    def _start_new_session(self):
        """Roll a new session: random N in [5-10], reset dispatch counter."""
        self._session_n = random.randint(POOL_MIN_TABS, POOL_MAX_TABS)
        self._session_dispatched = 0
        self._session_start_time = time.monotonic()
        log.info(f"Session reset: N={self._session_n} (max dispatches)")

    # --- Startup ---

    async def run(self):
        """Verify login, then run dispatch and management loops."""
        # One tab to verify login
        check_slot = await self._open_tab()
        if not check_slot.page:
            log.error("Failed to open initial tab")
            return

        log.info("Verifying login...")
        try:
            ok = await asyncio.wait_for(check_logged_in(check_slot.page), timeout=15)
        except asyncio.TimeoutError:
            ok = False
        if not ok:
            log.error("Not logged in — run with --setup first")
            return
        log.info("Login verified")

        # Leave check tab as an anchor (looks human); dispatcher opens fresh tabs
        self._start_new_session()
        log.info(f"TabPool running, session N={self._session_n}")

        tasks = [
            asyncio.create_task(self._dispatcher_loop(), name="dispatcher"),
            asyncio.create_task(self._session_timer_loop(), name="session_timer"),
            asyncio.create_task(self._linger_reaper_loop(), name="linger_reaper"),
            asyncio.create_task(self._health_loop(), name="health"),
        ]
        try:
            await asyncio.gather(*tasks)
        except (KeyboardInterrupt, asyncio.CancelledError):
            self._shutdown = True
            for t in tasks:
                t.cancel()

    # --- Tab Helpers ---

    async def _open_tab(self):
        """Open a fresh chatgpt.com tab, return TabSlot."""
        slot_id = self._next_slot_id
        self._next_slot_id += 1
        slot = TabSlot(slot_id)
        slot.state = TabSlotState.OPENING
        self.slots.append(slot)
        try:
            slot.page = await self.bm.new_page("https://chatgpt.com")
            slot.monitor = PageMonitor(slot.page)
            await slot.monitor.inject()
            slot.state = TabSlotState.IDLE
            log.info(f"Tab {slot.slot_id} opened (pool: {len(self.slots)})")
        except Exception as e:
            log.error(f"Tab {slot_id} open failed: {e}")
            slot.state = TabSlotState.CLOSING
        return slot

    async def _close_tab(self, slot):
        """Close a tab and remove from pool."""
        slot.state = TabSlotState.CLOSING
        try:
            if slot.page:
                await slot.page.close()
        except Exception:
            pass
        if slot in self.slots:
            self.slots.remove(slot)
        log.info(f"Tab {slot.slot_id} closed (pool: {len(self.slots)})")

    async def _refresh_slot_page(self, slot):
        """Replace a slot's page with a fresh chatgpt.com tab."""
        try:
            if slot.page:
                await slot.page.close()
        except Exception:
            pass
        slot.page = await self.bm.new_page("https://chatgpt.com")
        slot.monitor = PageMonitor(slot.page)
        await slot.monitor.inject()
        slot._current_model = "standard"

    # --- Dispatcher (sequential — one item at a time) ---

    async def _dispatcher_loop(self):
        """Poll queue, open a fresh tab per item, type and send inline."""
        while not self._shutdown:
            update_health("polling")

            # Session exhausted — idle until session timer resets
            if self._session_dispatched >= self._session_n:
                await asyncio.sleep(POLL_INTERVAL_SEC)
                continue

            # Poll for next queued item
            item = get_next_queued()
            if not item:
                await asyncio.sleep(POLL_INTERVAL_SEC)
                continue

            item_id = item.get("id")
            if not mark_in_progress(item_id):
                await asyncio.sleep(1)
                continue

            self._session_dispatched += 1
            log.info(f"Session dispatch {self._session_dispatched}/{self._session_n} — item #{item_id}")

            # Open a fresh tab for this item
            slot = await self._open_tab()
            if slot.state != TabSlotState.IDLE:
                log.error(f"Slot {slot.slot_id}: open failed, failing item #{item_id}")
                run_codex10("research-fail", str(item_id), "Tab open failed")
                if slot in self.slots:
                    self.slots.remove(slot)
                continue

            slot.item = item
            slot.composed = compose_prompt(item)
            slot.follow_up_round = 0
            composed = slot.composed
            log.info(
                f"Slot {slot.slot_id}: item #{item_id} [{composed['mode']}] "
                f"— {composed['routing_reasoning']}"
            )

            # Type and send inline (no contention — dispatcher is sequential)
            try:
                result = await self._send_prompt(slot, composed["prompt"], composed["mode"])
                if not result["success"]:
                    raise RuntimeError(result.get("error", "Send failed"))
            except Exception as e:
                log.error(f"Slot {slot.slot_id}: send failed for #{item_id}: {e}")
                run_codex10("research-fail", str(item_id), str(e))
                await self._close_tab(slot)
                continue

            # Message sent — hand off to async collector for wait/ingest
            asyncio.create_task(
                self._collect_lifecycle(slot),
                name=f"collect-{slot.slot_id}-item-{item_id}",
            )

            # Human-like pause before dispatching next item
            await asyncio.sleep(random.uniform(3, 8))

    # --- Send Prompt ---

    async def _send_prompt(self, slot, prompt, mode):
        """Select model, type prompt, click send. Returns {success, error?}."""
        async with self._focus_lock:
            slot.state = TabSlotState.FOCUSING

            if not self.bm.is_page_valid(slot.page):
                return {"success": False, "error": "Page invalid"}

            # Select model on first message
            if slot.follow_up_round == 0:
                if not await select_model_for_slot(slot, mode):
                    log.warning(f"Slot {slot.slot_id}: model switch to {mode} failed")
                    if mode != "standard":
                        return {"success": False, "error": f"Model switch to {mode} failed"}

            try:
                await slot.monitor.get_state()
            except (PageStateError, PageEvaluateError):
                pass

            textarea = await slot.page.find("textarea", timeout=10)
            if not textarea:
                return {"success": False, "error": "Cannot find textarea"}

            await textarea.click()
            await random_delay()

            if len(prompt) > 500:
                # CDP Input.insertText — reliable for long prompts
                await textarea.send_keys(" ")
                await asyncio.sleep(0.1)
                await textarea.send_keys("\x08")
                await asyncio.sleep(0.1)
                await slot.page.send(cdp_mod.input_.insert_text(text=prompt))
                await asyncio.sleep(0.5)
            else:
                await human_type(textarea, prompt)

            await random_delay()

            try:
                send_btn = await slot.page.find(
                    'button[data-testid="send-button"]', timeout=3
                )
                if send_btn:
                    await send_btn.click()
                else:
                    await textarea.send_keys("\n")
            except Exception:
                await textarea.send_keys("\n")

            log.info(f"Slot {slot.slot_id}: message sent")
        return {"success": True}

    # --- Collect Lifecycle (per-item, runs concurrently) ---

    async def _collect_lifecycle(self, slot):
        """Wait for ChatGPT response, handle follow-ups, ingest result, linger."""
        item = slot.item
        item_id = item.get("id")
        composed = slot.composed
        resolved_mode = composed["mode"]
        current_prompt = composed["prompt"]
        current_mode = resolved_mode
        mode_fallback_used = False

        try:
            while True:
                slot.state = TabSlotState.WAITING_RESPONSE

                state = await slot.monitor.get_state()
                initial_count = state.get("assistantMessageCount", 0) - 1
                if initial_count < 0:
                    initial_count = 0

                detector = ResponseDetector(
                    slot.monitor, mode=current_mode, initial_msg_count=initial_count
                )
                success, text = await detector.wait_for_response()

                if not success:
                    # Fallback: deep_research → thinking (once)
                    if (
                        (text or "").strip() == "No response started"
                        and current_mode == "deep_research"
                        and not mode_fallback_used
                    ):
                        mode_fallback_used = True
                        log.warning(
                            f"Slot {slot.slot_id}: deep_research didn't start "
                            f"for #{item_id}; retrying in thinking mode"
                        )
                        current_mode = "thinking"
                        try:
                            await self._refresh_slot_page(slot)
                        except Exception as e:
                            raise RuntimeError(f"Fallback refresh failed: {e}") from e
                        result = await self._send_prompt(
                            slot, current_prompt, current_mode
                        )
                        if not result["success"]:
                            raise RuntimeError(
                                result.get("error", "Fallback send failed")
                            )
                        continue
                    raise RuntimeError(text or "Response detection failed")

                # Check follow-up
                follow_up = evaluate_response(text, current_prompt)
                if follow_up and slot.follow_up_round < MAX_FOLLOW_UPS:
                    slot.follow_up_round += 1
                    slot.state = TabSlotState.NEEDS_FOLLOWUP
                    current_prompt = follow_up
                    current_mode = resolved_mode
                    log.info(
                        f"Slot {slot.slot_id}: follow-up "
                        f"{slot.follow_up_round}/{MAX_FOLLOW_UPS}"
                    )
                    result = await self._send_prompt(
                        slot, current_prompt, current_mode
                    )
                    if not result["success"]:
                        raise RuntimeError(
                            result.get("error", "Follow-up send failed")
                        )
                    continue
                break

            # Ingest — for deep_research, prefer the detector's CDP-extracted
            # text because get_all_response_text() can't read inside the
            # cross-origin DR iframe and would lose the full report.
            if resolved_mode == "deep_research" and text and len(text.strip()) > 200:
                full_text = text
            else:
                full_text = await slot.monitor.get_all_response_text()
                # If DOM extraction came back short but detector had good text,
                # prefer the detector's text (covers follow-up rounds too)
                if len((full_text or "").strip()) < len((text or "").strip()):
                    full_text = text
            note_path = ingest_result(item, full_text, resolved_mode)
            if note_path:
                run_codex10("research-complete", str(item_id), note_path)
                log.info(f"Slot {slot.slot_id}: item #{item_id} completed → {note_path}")
            else:
                run_codex10("research-fail", str(item_id), "Ingestion failed")
                log.error(f"Slot {slot.slot_id}: item #{item_id} ingestion failed")

        except PageStateError as e:
            log.error(f"Slot {slot.slot_id}: page lost for #{item_id}: {e}")
            run_codex10("research-fail", str(item_id), str(e))
        except Exception as e:
            log.error(f"Slot {slot.slot_id}: error for #{item_id}: {e}")
            run_codex10("research-fail", str(item_id), str(e))

        # Linger before closing (human-like)
        slot.linger_until = time.time() + random.uniform(
            TAB_CLOSE_DELAY_MIN, TAB_CLOSE_DELAY_MAX
        )
        slot.state = TabSlotState.DONE_LINGERING
        slot.item = None
        log.info(
            f"Slot {slot.slot_id}: lingering for "
            f"{slot.linger_until - time.time():.0f}s"
        )

    # --- Session Timer ---

    async def _session_timer_loop(self):
        """Every ~30 min, start a new session with a fresh random N."""
        while not self._shutdown:
            await asyncio.sleep(POOL_RESIZE_INTERVAL_SEC + random.uniform(-60, 60))
            self._start_new_session()

    # --- Linger Reaper ---

    async def _linger_reaper_loop(self):
        """Close tabs that have finished their linger period."""
        while not self._shutdown:
            await asyncio.sleep(10)
            now = time.time()
            for slot in list(self.slots):
                if slot.state == TabSlotState.DONE_LINGERING and now >= slot.linger_until:
                    log.info(f"Slot {slot.slot_id}: linger expired, closing")
                    await self._close_tab(slot)

    # --- Health ---

    async def _health_loop(self):
        """Periodic health logging and dead page cleanup."""
        while not self._shutdown:
            await asyncio.sleep(30)

            counts = {}
            for s in self.slots:
                counts[s.state.value] = counts.get(s.state.value, 0) + 1
            session_age = int(time.monotonic() - self._session_start_time)
            log.info(
                f"Pool health: {len(self.slots)} tabs, states={counts}, "
                f"session N={self._session_n} "
                f"dispatched={self._session_dispatched}/{self._session_n} "
                f"age={session_age}s"
            )
            update_health("active")

            # Detect and close dead pages
            for slot in list(self.slots):
                if slot.state in (TabSlotState.IDLE, TabSlotState.DONE_LINGERING):
                    if slot.page and not self.bm.is_page_valid(slot.page):
                        log.warning(f"Slot {slot.slot_id}: dead page, closing")
                        await self._close_tab(slot)


async def run_test_suite(bm, page):
    """Comprehensive test: multi-turn chat, then deep research. Browser stays open throughout.

    Phases:
      1. Login check
      2. Send initial message in standard mode, capture response
      3. Follow-up message in same chat, capture response
      4. New chat → deep research mode, send message, capture response
      5. Save all results to test output file

    Pass --test-skip-dr to skip the deep research phase (it can take 5–30 min).
    """
    skip_dr = "--test-skip-dr" in sys.argv
    test_output = PROJECT_DIR / ".codex" / "logs" / "test-results.json"
    results = {"phases": [], "success": True}

    def record(phase, success, text="", error=""):
        entry = {"phase": phase, "success": success, "chars": len(text)}
        if text:
            entry["text_preview"] = text[:200]
        if error:
            entry["error"] = error
        results["phases"].append(entry)
        if not success:
            results["success"] = False
        log.info(f"[TEST] Phase '{phase}': {'OK' if success else 'FAIL'} ({len(text)} chars)")

    log.info("=== TEST SUITE START ===")

    # Phase 1: Login check
    if not await check_logged_in(page):
        log.error("FAILED: Not logged in. Run with --setup first.")
        record("login_check", False, error="Not logged in")
        return

    record("login_check", True, text="Logged in")

    # Phase 2: Initial message in standard mode (same page, same chat)
    monitor = PageMonitor(page)
    await monitor.inject()
    await select_model(page, "standard")

    log.info("[TEST] Phase 2: Sending initial message (standard mode)...")
    result1 = await send_message_in_chat(
        page, monitor,
        "Explain the difference between a stack and a queue data structure in 2-3 sentences.",
        mode="standard",
    )
    if result1["success"]:
        record("standard_initial", True, text=result1["text"])
    else:
        record("standard_initial", False, error=result1.get("error", "unknown"))
        log.error("[TEST] Initial message failed — aborting remaining phases")
        _save_test_results(test_output, results)
        return

    # Phase 3: Follow-up in same chat (no navigation)
    log.info("[TEST] Phase 3: Sending follow-up in same chat...")
    result2 = await send_message_in_chat(
        page, monitor,
        "Now give a real-world analogy for each one.",
        mode="standard",
    )
    if result2["success"]:
        record("standard_followup", True, text=result2["text"])
    else:
        record("standard_followup", False, error=result2.get("error", "unknown"))

    # Collect full conversation text
    full_convo = await monitor.get_all_response_text()
    log.info(f"[TEST] Full conversation: {len(full_convo)} chars across all assistant messages")

    # Phase 4: Extended thinking / Pro mode (new chat)
    log.info("[TEST] Phase 4: Opening new chat for extended thinking...")
    page_think = await bm.get_page("https://chatgpt.com")
    await asyncio.sleep(2)
    monitor_think = PageMonitor(page_think)
    await monitor_think.inject()

    try:
        switched = await select_model(page_think, "thinking")
        if not switched:
            record("thinking", False, error="Could not switch to thinking/pro model")
        else:
            result_think = await send_message_in_chat(
                page_think, monitor_think,
                "What is the time complexity of finding the longest increasing subsequence in an array? Walk through the reasoning step by step.",
                mode="thinking",
            )
            if result_think["success"]:
                record("thinking", True, text=result_think["text"])
            else:
                record("thinking", False, error=result_think.get("error", "unknown"))
    except Exception as e:
        record("thinking", False, error=str(e))
        log.error(f"[TEST] Thinking mode error: {e}")

    # Phase 5: Deep Research (new chat)
    if skip_dr:
        log.info("[TEST] Phase 5: Deep research SKIPPED (--test-skip-dr)")
        record("deep_research", True, text="skipped by flag")
    else:
        log.info("[TEST] Phase 5: Opening new chat for deep research...")
        page_dr = await bm.get_page("https://chatgpt.com")
        await asyncio.sleep(2)
        monitor_dr = PageMonitor(page_dr)
        await monitor_dr.inject()

        try:
            switched = await select_model(page_dr, "deep_research")
            if not switched:
                record("deep_research", False, error="Could not switch to deep research model")
            else:
                result_dr = await send_message_in_chat(
                    page_dr, monitor_dr,
                    "What are the latest advances in quantum error correction as of 2025? Provide a brief summary.",
                    mode="deep_research",
                )
                if result_dr["success"]:
                    record("deep_research", True, text=result_dr["text"])
                else:
                    record("deep_research", False, error=result_dr.get("error", "unknown"))
        except Exception as e:
            record("deep_research", False, error=str(e))
            log.error(f"[TEST] Deep research error: {e}")

    # Save results
    _save_test_results(test_output, results)

    overall = "PASS" if results["success"] else "FAIL"
    log.info(f"=== TEST SUITE {overall} === (results saved to {test_output})")


def _save_test_results(path, results):
    """Write test results JSON to disk."""
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(results, f, indent=2)
    except Exception as e:
        log.warning(f"Could not save test results: {e}")


async def main_loop():
    """Main entry point — uses BrowserManager for guaranteed cleanup."""
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

    log.info("Starting ChatGPT research driver")
    update_health("starting")

    # Recover any items left in_progress from a previous crash.
    # Age=0 means requeue ALL in_progress items unconditionally — since this
    # is a single-instance process, any in_progress items are from a dead session.
    output, _rc = run_codex10("research-requeue-stale", "0")
    if output:
        log.info(f"Startup stale requeue: {output.strip()[:200]}")

    async with BrowserManager() as bm:
        page = await bm.new_page("https://chatgpt.com")

        if "--setup" in sys.argv:
            if DISPLAY_MODE == "none":
                log.error("--setup requires a display (X11 or WSLg). Cannot run headless for manual login.")
                sys.exit(1)
            if DISPLAY_MODE == "xvfb":
                log.warning("--setup under Xvfb: browser is invisible. Use a real display for manual login.")
            log.info("Setup mode: browser opened for manual login")
            log.info("Log in to ChatGPT manually, then close the browser")
            update_health("setup")
            try:
                while True:
                    await asyncio.sleep(5)
            except (KeyboardInterrupt, asyncio.CancelledError):
                pass
            # BrowserManager.__aexit__ handles cleanup
            return

        if "--test" in sys.argv:
            await run_test_suite(bm, page)
            return

        # Normal operation: multi-tab pool
        try:
            pool = TabPool(bm)
            await pool.run()
        except KeyboardInterrupt:
            log.info("Shutting down")
        except Exception as e:
            log.error(f"Fatal error: {e}")
            update_health("crashed")
            raise
        finally:
            update_health("stopped")


if __name__ == "__main__":
    lock_handle = acquire_single_instance_lock()
    if fcntl is not None and lock_handle is None:
        print("Another research driver instance is already running; exiting.", file=sys.stderr)
        sys.exit(1)
    try:
        asyncio.run(main_loop())
    except KeyboardInterrupt:
        pass
    except SystemExit:
        pass
    finally:
        if lock_handle is not None:
            try:
                lock_handle.close()
            except Exception:
                pass
