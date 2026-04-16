# Queue Policy Simulator

Static browser prototype for visualizing truck-post threshold policies against a shared downstream team.

The app now opens on a provided 18-truck scenario with exact `lpm` and threshold inputs, plus the requested dynamic settings:

- `agents=7`
- `agent_handle_time=120`
- `capacity=3.50/min`
- `safe_capacity=2.80/min`
- `allocation_gamma=0.25`
- `max_truck_share=0.4`
- `smoothing_factor=0.5`

## Run

Use any static file server from this directory. For example:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Model Notes

- The current version is deterministic on arrivals and uses a repeatable synthetic score distribution.
- Truck posts can be configured with exact `lpm` and threshold ratios instead of bucket-only volume estimates.
- A capture occurs when an agent starts work on a load before the stale window closes.
- Agents stay occupied for the full configured handle time after the grab.
- Dynamic pressure lift increases thresholds as the queue grows.
- Thin-market protection only changes queue ordering.
