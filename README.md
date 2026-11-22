# Low Tide City

[![Make GTA 6 on make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/muhammadaldy198/low-tide-city/rank.svg)](https://make.fun/c/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/muhammadaldy198/low-tide-city/reward.svg)](https://make.fun/c/gta6-01)

An original open-world crime game that runs entirely in the browser, offline,
from static files. Entry for the make.fun competition
[Make GTA 6 (gta6-01)](https://make.fun/c/gta6-01).

## The game

Puerto Ámbar — "Low Tide City" — is a fictional Caribbean port of six
districts: the glass towers of Centro, the terracotta lanes of the Casco,
the pastel beachfront of La Orilla, the cranes and warehouses of Los Muelles,
the quiet streets of Las Lomas, and the neon strip of Neón across the river.

You arrive with nothing. Walk the city on foot, take any car you can reach,
run jobs for the people who run the docks, and learn how fast the Policía
Municipal answers when the stars start climbing.

- A seeded 14×14-block city (~1.3 km²) with a coast, a river, three bridges,
  landmarks and six districts, generated deterministically from one seed.
- On foot and behind the wheel: walk, sprint, enter and steal vehicles.
- Arcade driving with traffic, parked cars and pedestrians.
- A wanted system (0–5 stars) with patrols, pursuit, roadblocks and evasion.
- A story chain of missions plus repeatable side jobs, cash, respect and rank.
- Day/night cycle, weather, minimap, save game — all in plain JavaScript,
  no engine, no network, no dependencies.

## Play it

Open `game/index.html` in a desktop browser, or serve the folder:

```
node --experimental-strip-types serve.ts
```

then visit http://localhost:8080. Controls: WASD/arrows to move and drive,
Shift to sprint, E to enter/leave a car, Space for the handbrake, M for the
map, P or Esc to pause.

## How this entry is built

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/`
to the output directory and writes `dossier.json` with the kit's own
`vendor/makefun-game.ts` library. The game itself is dependency-free
JavaScript under `game/src/`.

## License

MIT — see [LICENSE](LICENSE). Everything here — city, names, story, art and
code — is original to this repository.
