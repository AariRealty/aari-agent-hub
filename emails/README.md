# SkySlope agent series — August 2026

Three emails to the active agents, one a day, 8am Eastern:

| | File | Subject | GIF |
|---|---|---|---|
| 1 | `skyslope-1-misc.html` | SkySlope: menos casillas que llenar | keeps the giphy one |
| 2 | `skyslope-2-documentos.html` | Documentos: someterlo o subirlo, nada más | removed |
| 3 | `skyslope-3-comunicacion.html` | Un cambio chiquito, una diferencia enorme | removed |

All three carried the same GIF. giphy.com and media.giphy.com are blocked by
this session's egress proxy, so a different one could not be sourced or
verified; Marlenyi chose to drop it from 2 and 3 rather than repeat it.

**To:** marlenyi@aarirealty.com
**BCC:** rooseveltsanchezrealestate@gmail.com, machuca.alied@gmail.com,
flaviamaguilera@gmail.com, milennys.re@gmail.com, odalis.mora1977@gmail.com,
jalexparedes.realestate@gmail.com, eileenrefl@gmail.com

This list came from Marlenyi and overrides realty_members, which is wrong on
four of the seven:

| | realty_members | actual |
|---|---|---|
| Roosevelt Sanchez | roosevelt.sanchez@aarirealty.com | rooseveltsanchezrealestate@gmail.com |
| Alied Machuca | alied.machuca@aarirealty.com | machuca.alied@gmail.com |
| Flavia Aguilera | flavia.aguilera@aarirealty.com | flaviamaguilera@gmail.com |
| Alejandro Paredes | jalexparedes.q@gmail.com | jalexparedes.realestate@gmail.com |
| Odalis Mora | *not on the roster at all* | odalis.mora1977@gmail.com |

Ana Puentes is deliberately excluded — suspended.

The `<body>` inner HTML is the email. The hidden first div is the preheader.
The GIF is hotlinked from giphy; it loads for the recipient, not from here.

## Sending

All three exist as Gmail drafts, addressed and ready. Use Gmail's own
**Schedule send** on each one.

A scheduled Routine cannot do it: a Routine-fired session does not inherit
this session's Gmail connector, so it would wake up with no way to send and
would stop rather than deliver. A trigger was created, seen to have no
connector grant, and deleted rather than left to fail silently.
