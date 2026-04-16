# Worker Isolation: Firecracker vs Docker — Decision Document

## Context

mac10 needs strong worker isolation for untrusted code execution.
Current isolation priority chain: microsandbox (msb) → Docker → tmux.

## Options Evaluated

### Firecracker (microVMs)

**Pros:**
- True hardware-level isolation via KVM
- Sub-second boot times (~125ms)
- Minimal memory footprint (~5MB per VM)
- Used in production by AWS Lambda and Fargate
- Strong security boundary (kernel-level)

**Cons:**
- Requires KVM (Linux-only, no macOS/Windows support)
- Requires root or privileged access for /dev/kvm
- No native macOS support (critical for dev environments)
- Complex networking setup (TAP devices, IP routing)
- No Docker Hub image ecosystem
- File sharing between host and guest is non-trivial (vsock or network)
- Limited toolchain compared to Docker

### Docker (containers)

**Pros:**
- Cross-platform (Linux, macOS, Windows)
- Rich ecosystem (images, compose, buildkit)
- Easy volume mounting for file sharing
- Works in CI/CD environments
- Well-understood security model (namespaces, cgroups, seccomp)
- GPU passthrough support
- Works without root (rootless mode)

**Cons:**
- Shared kernel (weaker isolation than VMs)
- Container escapes possible (though rare)
- Docker Desktop licensing on macOS/Windows
- Heavier than Firecracker for trivial workloads

### Microsandbox (msb) — Current Implementation

**Pros:**
- Already integrated in mac10
- Lightweight microVM approach
- Designed for sandboxing CLI tools

**Cons:**
- Smaller community, less battle-tested
- Limited documentation
- May not be available in all environments

## Decision

**Docker remains the primary isolation backend.** Firecracker is not adopted at this time.

### Rationale

1. **Developer experience**: Most mac10 users develop on macOS. Firecracker requires KVM/Linux, making it unusable for the primary audience.

2. **Existing integration**: Docker support is already implemented and tested. The msb → Docker → tmux fallback chain works reliably.

3. **Pragmatic security**: Docker provides sufficient isolation for mac10's threat model (untrusted worker code in a developer environment). The risk profile does not justify the complexity of Firecracker.

4. **Future path**: If mac10 moves to a cloud-hosted execution model, Firecracker becomes viable for server-side worker isolation. At that point, we can add it as an additional backend without disturbing the existing chain.

### Isolation Priority (unchanged)

```
microsandbox (msb) → Docker → tmux (process-level)
```

Each level falls through to the next on failure or unavailability.

### Security Hardening Recommendations

For Docker-based workers:
- Use `--read-only` filesystem where possible
- Drop all capabilities except required ones
- Set `--memory` and `--cpus` limits
- Use `--network=none` unless network access is needed
- Enable seccomp profiles
- Run as non-root user inside containers
