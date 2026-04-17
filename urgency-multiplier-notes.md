# Urgency Multiplier

## Goal

In the dynamic threshold model:

- `loads/min` measures opportunity
- `market_points` measures urgency

The clean way to combine them is to turn `market_points` into a bounded urgency multiplier and multiply it into the allocation weight.

## Core Recommendation

Do **not** use `market_points` linearly.

Use a **bounded, smooth urgency multiplier** centered at `1.0`.

That means:

- normal truck post -> multiplier near `1.0`
- low urgency -> somewhat below `1.0`
- high urgency -> somewhat above `1.0`
- never so extreme that urgency completely overwhelms volume

## Desired Properties

A good urgency multiplier should be:

- bounded
- smooth
- monotonic
- calibrated

## Proposed Construction

### 1. Normalize `market_points`

Convert raw market points into a relative score:

- `z_i = normalized_market_points`

Recommended normalization:

- percentile rank among active truck posts

So:

- lowest urgency -> near `0`
- middle urgency -> near `0.5`
- highest urgency -> near `1`

## Preferred Mapping

Start with:

- `u_i = 1 + 0.4 * (2*z_i - 1)`

Then clamp to:

- `u_i in [0.6, 1.4]`

Interpretation:

- bottom urgency truck posts get about `0.6`
- middle gets `1.0`
- top gets `1.4`

This gives urgency real influence without allowing it to dominate the whole allocator.

## Why This Shape

This mapping is useful because:

- average urgency stays around `1.0`
- low and high urgency are symmetric around normal
- urgency tilts the allocation instead of replacing opportunity

## Alternative Linear Mappings

Simple options if you want easier tuning:

- conservative:
  - `u_i = 0.7 + 0.6 * z_i`
  - range roughly `[0.7, 1.3]`
- balanced:
  - `u_i = 0.6 + 0.8 * z_i`
  - range roughly `[0.6, 1.4]`
- aggressive:
  - `u_i = 0.5 + 1.1 * z_i`
  - range roughly `[0.5, 1.6]`

The recommended starting point is still the centered mapping:

- `u_i = 1 + 0.4 * (2*z_i - 1)`, clamped to `[0.6, 1.4]`

## How It Fits Into The Model

Current allocation weight:

- `weight_i = loads_per_min_i ^ gamma`

Updated allocation weight with urgency:

- `weight_i = (loads_per_min_i ^ gamma) * u_i`

where:

- `u_i` is the urgency multiplier derived from `market_points`

## Full Interpretation

- `loads/min` answers: how much opportunity is here?
- `market_points` answers: how badly do we need to act here now?

The urgency multiplier lets both matter:

- opportunity drives baseline allocation
- urgency adjusts allocation up or down
- max lane share still prevents any one truck post from consuming the whole system

## Practical Recommendation

Use:

1. percentile-normalized `market_points`
2. bounded urgency multiplier around `1.0`
3. initial range of `[0.6, 1.4]`

Then tune only if needed.
