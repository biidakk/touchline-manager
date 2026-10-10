# Design proposal: player attributes, height and training

Status: **built in v1.5** with the confirmed decisions: skill kept with TEC and PHY under it, one potential, all three coaches, group presets with per-player overrides, scouted ranges for other clubs' attributes.

## 1. Research basis (summary)

| Topic | What the evidence says | What we take from it |
|---|---|---|
| Fitness-fatigue model (Banister et al. 1975; Morton, Fitz-Clarke & Banister) | Each training load creates a slow, long-lasting **fitness** effect and a fast, short-lived **fatigue** effect. Performance = fitness − fatigue. Common default time constants: ~42 days (fitness), ~7 days (fatigue). The fatigue constant matters most. | Two running numbers per player: a slow "development" accumulator and a fast "fatigue" level (our existing energy). |
| Acute:chronic workload ratio (Gabbett 2016) | Rolling 7-day load vs 28-day load. A ratio of **0.8–1.3** carries minimal injury risk. Sharp spikes (**> 1.5**) raise risk clearly; sources cite up to +50 % at ≥ 1.8. Later research questions how well it predicts. | Injury risk scales with load spikes, not with high load as such. Players can be built up to hard training gradually. |
| Height in aerial duels (StatsBomb "HOPS") | Height explains about **22 %** of heading ability: about **+0.7 % duel success per extra cm**. Jumping, timing and positioning matter more. | Height is a moderate factor in headers. Physical and technical ability (jump, timing) count for more. |

## 2. New player attributes

All on the existing 1–100 scale.

| Attribute | Meaning | Covers |
|---|---|---|
| **TEC**, technical | Ball skills | Passing, first touch, dribbling, shooting technique, heading technique; for keepers: handling and distribution |
| **PHY**, physical | Athleticism | Pace, strength, stamina, jumping; for keepers: reflexes and agility |
| **Height** (cm) | Fixed from age 19 (16–18-year-olds may still grow 0–5 cm) | Aerial duels, keeper reach |
| **Potential** | Kept: the ceiling for overall ability | Unchanged meaning |

**Skill stays as the overall rating**, derived by position:

| Position | TEC weight | PHY weight |
|---|---|---|
| Goalkeeper | 0.45 | 0.55 |
| Defender | 0.40 | 0.60 |
| Midfielder | 0.65 | 0.35 |
| Forward | 0.55 | 0.45 |

So everything that already works (value, AI, tables, "skill/potential" on shirts) keeps working. TEC, PHY and height are shown alongside. Two players with the same skill can now be very different: a 1.94 m physical centre-back, or a small technical playmaker.

**Heights:** generated per position with a normal spread.

| Position | Mean height | Spread (sd) |
|---|---|---|
| Goalkeeper | 190 cm | 4 |
| Centre-backs (most defenders) | 186 cm | 5 |
| Midfielders | 178 cm | 6 |
| Forwards | 182 cm | 6 |

**Aerial ability** (derived, not stored):
`aerial = 0.45·PHY + 0.25·TEC + 30·heightFactor`, where `heightFactor` runs from 0 at 165 cm to 1 at 200 cm.

**Existing careers:** each player's skill is split into TEC and PHY around a random profile, so that the weighted value equals his current skill; a height is drawn as above.

## 3. The match "matrix": where each attribute counts

| Engine factor | TEC | PHY | Height / aerial | Notes |
|---|---|---|---|---|
| Possession (midfield) | 70 % | 30 % | - | Technical midfields keep the ball |
| Chance creation (attack) | 60 % | 40 % | - | Attackers' quality |
| Stopping chances (defence) | 40 % | 60 % | - | Defenders win duels with pace and strength |
| Shot conversion (shooter vs keeper) | 70 % | 30 % | - | Finishing technique, plus power |
| Keeper vs shots | 50 % | 50 % | - | Handling and reflexes |
| **Headers** (corners, crosses) | heading technique | jumping | **height** | Aerial duel, see below |
| **Crosses** style | wide players' TEC | - | box targets' aerial | Best with tall, strong forwards |
| **Through-balls** style | passers' TEC | **forwards' PHY (pace)** vs defenders' PHY | - | Fast forwards beat slow defenders |
| **Passing** style | midfield TEC | - | - | Pure technique |
| Stamina (energy drain) | - | drain × (1.25 − PHY/200) | - | PHY 90 tires ~20 % slower than PHY 50 |
| Late-game tiredness | erodes slowly | erodes fast | - | Low energy cuts PHY's contribution more |
| Injury risk | - | lower with higher PHY | - | Plus the training-load factor (section 4) |

**Aerial duel** (corner or cross into the box):
`P(attacker wins) = 0.5 + 0.007·(height_att − height_def) + 0.006·(aerial_att − aerial_def)`, clamped to 0.15–0.85.
- That gives about +0.7 % per cm, as in the research, with jumping and timing (via aerial) mattering a bit more overall.
- If the attacker wins, the header is a chance whose quality depends on his aerial ability versus the keeper. The keeper's height helps him claim crosses.

**The play styles become real choices:**
- **Crosses** pay off with tall, strong forwards.
- **Through-balls** pay off with fast forwards against slow defences.
- **Passing** pays off with a technical midfield.

The percentages under each style on My Team will be computed from these attributes.

## 4. Training

### 4.1 Coaching staff (new "Training" screen)
- **Fitness coach:** physical training, recovery and injury prevention.
- **Technical coach:** technical training.
- **Goalkeeping coach** (optional): technical and physical training for keepers.
- **Coach quality:** each coach has a quality of 1–5 stars, worth ×0.8 to ×1.3 on gains, and a yearly wage that rises steeply with quality.
- **Hiring:** a pool of available coaches is regenerated every summer. Hiring is immediate; firing pays out the rest of the contract.
- **AI clubs:** they get coaches of about the quality their reputation suggests, so the world develops as it does today.

### 4.2 Training plans
- **Settings:** each player has a **focus** (Physical / Technical / Balanced / Recovery) and an **intensity** (Light / Normal / Hard).
- **Group defaults:** for the whole squad, or for GK / defenders / midfielders / forwards, with per-player overrides.
- **Automatic tapering** (a light day before matches) is switched on by default; a good fitness coach does it better.

### 4.3 Daily mechanics (fitness-fatigue model)
Every day without a match is a training day; matches count as a heavy load.

| Intensity | Training load | Fatigue added | Development gain |
|---|---|---|---|
| Recovery | 0 | − (extra recovery) | 0 |
| Light | 1 | +2 | ×0.6 |
| Normal | 2 | +4 | ×1.0 |
| Hard | 3 | +7 | ×1.4 |
| Match | 4 | (as now) | (match experience) |

- **Fatigue = 100 − energy.**
  - Recovery per day: `9 × (0.75 + PHY/200) × ageFactor × fitnessCoachFactor` (age factor 1.0 up to age 28, about 0.8 at 33+).
  - So high physical ability means less fatigue, and harder training means more fatigue.
  - Energy feeds into the match engine as it does now: a tired team plays worse.
- **Development:** daily XP into the trained attribute:
  `XP = base × intensityGain × coachQuality × ageCurve(attribute) × roomToPotential × (energy/100)`
  - The `energy/100` term means training while exhausted gives less. That rewards smart intensity, not simply "Hard always".
  - Each 1.0 XP is +1 point in TEC or PHY. Skill (derived) rises with it, but never above potential.
- **Age curves:**
  - TEC learns fastest at 16–21 and keeps improving slowly until about 28.
  - PHY builds until about 25, holds until 29, then declines; hard physical training slows the decline.
  - Veterans' decline (from age 30) applies mainly to PHY, so a 33-year-old playmaker stays useful longer than a 33-year-old winger.
- **Playing time:** matches still give development (as now), split by position.
- **Injury risk (workload):** per player, a 7-day "acute" load and a 28-day "chronic" load.
  - The ratio scales injury chance in matches and training: ×1.0 between 0.8 and 1.3, ×1.5 above 1.5, ×2 above 1.8.
  - A good fitness coach lowers it. The Training screen shows a traffic light per player.
- **Calibration targets** (checked by the 20-season test):

  | Setup | Development vs today | Typical match-day energy | Injuries |
  |---|---|---|---|
  | Balanced / Normal, average coaches | same as today (talented teenagers about +5 a season) | ~95 | as now |
  | Hard, with a good coach | +30–40 % | ~85 | about +40 % if not tapered |
  | Light | −30 % | ~100 | as now |

## 5. Screens
- **Training** (new menu item):
  - The coaches panel (hire and fire).
  - A squad table with TEC / PHY / height, energy, workload light and plan.
  - Group presets.
  - "+ this month" gains per player.
- **My Team, Other Teams, Market, player dialog:** show TEC / PHY / height. Search filters for minimum TEC, PHY and height (scouting reveals TEC/PHY ranges, like potential).
- **Match report:** aerial duels won.

## 6. Decisions to confirm
1. **Skill stays the overall rating**, derived from TEC/PHY by position (recommended), or replace it entirely with the two numbers?
2. **One potential** (the overall ceiling, recommended), or separate TEC and PHY potentials?
3. **Coaches:** fitness and technical, plus an optional goalkeeping coach (recommended), or a single head coach?
4. **Training plans:** group presets with per-player overrides (recommended), or per player only?
5. **Scouting** also hides other clubs' TEC/PHY as ranges (recommended for consistency), or show them openly?
