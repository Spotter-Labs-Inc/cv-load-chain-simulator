# Queue Policy Simulator

Static browser prototype for visualizing truck-post threshold policies against a shared downstream team.

## Run

Use any static file server from this directory. For example:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Model Notes

- The current version is deterministic on arrivals and uses a repeatable synthetic score distribution.
- A capture occurs when an agent starts work on a load before the stale window closes.
- Agents stay occupied for the full configured handle time after the grab.
- Dynamic pressure lift increases thresholds as the queue grows.
- Thin-market protection only changes queue ordering.
