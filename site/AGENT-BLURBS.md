# Agent blurbs — fill these in

Everything below goes into `js/agents-data.js`. Two fields per person.

**blurb** — one or two sentences in their voice. This is what shows on the card
and it's the thing people actually read. 120–160 characters reads best.
Skip "hardworking" and "dedicated". Say what they're good at and who they're for.

**tags** — 2 to 4 short words. Areas, languages, what they specialize in.
These power the search box and become the filter chips, so use words a client
would actually type. Lowercase.

---

### Marlenyi Paredes — Broker-Owner *(done, edit if you want)*
```
blurb: 'I built Aari so no one gets handed a contract they do not understand. If you want the broker herself, and you want to be told the truth about your number, that is me.'
tags:  ['lehigh acres', 'fort myers', 'cape coral', 'naples', 'spanish', 'pricing strategy', 'compliance']
```

### Alejandro Paredes — Realtor®
```
blurb: ''
tags:  []
```

### Odalis Mora — Realtor®
```
blurb: ''
tags:  []
```

### Alied Machuca — Realtor®
```
blurb: ''
tags:  []
```

### Ana Puentes — Realtor®
```
blurb: ''
tags:  []
```

### Flavia Aguilera — Realtor®
```
blurb: ''
tags:  []
```

### Roosevelt Sanchez — Realtor®
```
blurb: ''
tags:  []
```

### Eileen Hernandez — Realtor® · Transaction Coordinator
```
blurb: ''
tags:  []
```

### Milennys Vargas — Realtor® · Transaction Coordinator
```
blurb: ''
tags:  []
```

---

## Titles and second hats

`title` is the main line. `badge` is the second hat, and only three people have one:

| | title | badge |
|---|---|---|
| Marlenyi | `Broker-Owner` | `Realtor®` |
| Eileen | `Realtor®` | `Transaction Coordinator` |
| Milennys | `Realtor®` | `Transaction Coordinator` |
| everyone else | `Realtor®` | *(empty)* |

Both show in the popup: the title as a filled black pill, the badge as a grey one
beside it. The list on the left reads them together — "Realtor® · Transaction
Coordinator".

The popup also has two role filters built from this, **Broker** and
**Transaction Coordinators**, so someone can jump straight to them.

---

## Intro videos, when you're ready

The card and the detail panel already handle video. Add two fields per agent:

```
video:       'videos/odalis-intro.mp4'      // or a Vimeo / YouTube embed URL
videoPoster: 'images/odalis-poster.jpg'     // optional, falls back to their photo
```

What happens when `video` is set:
- the card gets a small **▸ Intro** badge over the photo
- the detail panel plays the video instead of showing the still
- it does not autoplay, and it does not preload — no bandwidth cost until someone
  presses play

Nothing breaks while these are empty, so add them one agent at a time.

**Filming notes** — 30 to 45 seconds, shot vertical or square, good light, say your
name, the areas you work, and one sentence on who you're best for. Same three
things every time so the set feels like a set.

## Adding a new agent

Copy any block in `js/agents-data.js`, change the fields. The directory, the
search, the chips and the contact form all pick it up. Nothing else to touch.
Set `isActive: false` to hide someone without deleting them.
