# Troubleshooting

## Docker build fails with "failed to prepare ... missing parent bucket" or "parent snapshot ... does not exist"

Symptom: `docker compose up --build` (or `docker compose -f docker-compose-whatsap.yml up -d --build`)
fails partway through, on different services/layers each retry, with errors like:

```
failed to prepare sha256:... as ...: failed to create snapshot: missing parent "moby/.../sha256:..." bucket: not found
failed to prepare sha256:... as ...: parent snapshot sha256:... does not exist: not found
```

This is containerd/BuildKit state corruption on the host, not a problem with the Dockerfiles or
compose files. A `docker builder prune -af` or a plain `systemctl restart docker` is **not**
enough to fix it — the corruption lives in on-disk metadata that survives a daemon restart.

There are two places this state can go bad independently; check/reset both:

1. **containerd's own metadata + overlayfs snapshotter** (`/var/lib/docker/containerd/` or
   wherever `docker info` reports as `Docker Root Dir`, e.g. `/mnt/docker/containerd/`):
   `io.containerd.metadata.v1.bolt/meta.db` and `io.containerd.snapshotter.v1.overlayfs/`.
2. **BuildKit's own separate cache/state store**, at `<Docker Root Dir>/buildkit/` (`cache.db`,
   `history_*.db`, `containerd-overlayfs/`) — independent of (1), and the more likely culprit if
   (1) looks fine but the error persists after resetting it.

Fix (run as root; this moves the corrupted directories aside rather than deleting them, so they
can be inspected or restored if needed):

```
sudo systemctl stop docker docker.socket containerd

# reset containerd metadata + snapshotter
sudo mv <Docker Root Dir>/containerd/io.containerd.snapshotter.v1.overlayfs <Docker Root Dir>/containerd/io.containerd.snapshotter.v1.overlayfs.bak
sudo mv <Docker Root Dir>/containerd/io.containerd.metadata.v1.bolt <Docker Root Dir>/containerd/io.containerd.metadata.v1.bolt.bak

# reset BuildKit's own state (separate from the above)
sudo mv <Docker Root Dir>/buildkit <Docker Root Dir>/buildkit.bak

sudo systemctl start docker
```

Your downloaded image blobs (`<Docker Root Dir>/containerd/io.containerd.content.v1.content/`)
are untouched by this, so builds re-extract layers locally rather than re-pulling everything from
the network — but the BuildKit cache is gone, so the next build will be slower (cold cache) even
though it should now succeed.

Find `<Docker Root Dir>` with `docker info --format '{{.DockerRootDir}}'`.

## GPU container fails to start: `open /usr/lib/x86_64-linux-gnu/libnvidia-egl-gbm.so.1.1.3: no such file or directory`

Symptom: `llama-server` (or any other GPU-backed service) fails to start with an OCI runtime
error naming a specific `libnvidia-*.so.<version>` file that doesn't exist on the host, even
though `nvidia-smi` and the driver are fine.

Cause: NVIDIA's Container Device Interface (CDI) spec at `/run/cdi/nvidia.yaml` is a cached
snapshot of host library paths, generated once by `nvidia-ctk`/the NVIDIA driver installer. If an
`apt upgrade` bumps a package like `libnvidia-egl-gbm1` to a new version (e.g. `1.1.3` → `1.1.4`),
that cached spec keeps pointing at the old, now-deleted filename until it's regenerated.

Fix:

```
sudo nvidia-ctk cdi generate --output=/run/cdi/nvidia.yaml
```

Then retry `docker compose up`. No Docker/containerd restart needed for this one.
