/* ============================================================================
   Aari Realty · agent roster — THE single source of truth.
   Mirrors the schema of aaritransactions.com/tcs.json field for field, so the
   same renderer draws both sites. Shipped as JS rather than JSON only because
   this site is plain static files with no fetch/serve step; the shape is
   identical, so it can move to agents.json whenever you want.

   BEFORE LAUNCH — verify every row:
     · currently affiliated with Aari Realty LLC
     · Florida license active and on file
     · `bestFor` — the SHORT label under each face (2 words max, e.g.
       "First-time buyers", "Waterfront", "New construction"). Left blank on
       purpose: it falls back to the title, so every face currently reads
       "Realtor®". Fill these in and the row reads like the Transactions team.
     · `fitLine` — one sentence in that agent's voice. Only Marlenyi's is
       written; inventing a specialty for a named licensee is a false
       advertising problem, so the rest are blank until you write them.
   Set isActive:false to hide someone without deleting the row.

   NOT INCLUDED: Eileen Hernandez and Milennys Vargas are transaction
   coordinators, not selling agents, so they are not on a consumer-facing
   "choose your agent" list.
   ========================================================================== */

window.AARI_AGENTS = {
  _meta: { lastUpdated: '2026-01-01', version: 1 },
  agents: [
    {
      id: 'marlenyi',
      firstName: 'Marlenyi',
      lastName: 'Paredes',
      displayName: 'Marlenyi Paredes',
      title: 'Broker-Owner',
      role: 'broker_owner',
      email: 'marlenyi@aarirealty.com',
      photoUrl: 'images/marlenyi.jpg',
      photoPortrait: 'images/marlenyi-portrait.jpg',
      specialties: ['Pricing strategy', 'Compliance review', 'Agent development'],
      marketAreas: ['Lehigh Acres', 'Fort Myers', 'Cape Coral', 'Naples'],
      languages: ['English', 'Spanish'],
      hours: 'Weekdays + weekends',
      bestFor: 'Compliance',
      license: 'FL Licensed Broker',
      social: { instagram: 'https://www.instagram.com/marlenyi.paredes/', tiktok: '' },
      fitLine: 'Pick Marlenyi if you want the broker herself, and you want to be told the truth about your number.',
      isActive: true, showInCarousel: true, pickable: true
    },
    {
      id: 'alejandro',
      firstName: 'Alejandro', lastName: 'Paredes', displayName: 'Alejandro Paredes',
      title: 'Realtor®', role: 'agent',
      photoUrl: 'images/alejandro-paredes.jpg', photoPortrait: '',
      specialties: [], marketAreas: [], languages: ['English', 'Spanish'],
      hours: '', bestFor: '', license: '', social: { instagram: '', tiktok: '' },
      fitLine: '',
      isActive: true, showInCarousel: true, pickable: true
    },
    {
      id: 'odalis',
      firstName: 'Odalis', lastName: 'Mora', displayName: 'Odalis Mora',
      title: 'Realtor®', role: 'agent',
      photoUrl: 'images/odalis-mora.jpg', photoPortrait: '',
      specialties: [], marketAreas: [], languages: ['English', 'Spanish'],
      hours: '', bestFor: '', license: '', social: { instagram: '', tiktok: '' },
      fitLine: '',
      isActive: true, showInCarousel: true, pickable: true
    },
    {
      id: 'alied',
      firstName: 'Alied', lastName: 'Machuca', displayName: 'Alied Machuca',
      title: 'Realtor®', role: 'agent',
      photoUrl: 'images/alied-machuca.jpg', photoPortrait: '',
      specialties: [], marketAreas: [], languages: ['English', 'Spanish'],
      hours: '', bestFor: '', license: '', social: { instagram: '', tiktok: '' },
      fitLine: '',
      isActive: true, showInCarousel: true, pickable: true
    },
    {
      id: 'ana',
      firstName: 'Ana', lastName: 'Puentes', displayName: 'Ana Puentes',
      title: 'Realtor®', role: 'agent',
      photoUrl: 'images/ana-puentes.jpg', photoPortrait: '',
      specialties: [], marketAreas: [], languages: ['English', 'Spanish'],
      hours: '', bestFor: '', license: '', social: { instagram: '', tiktok: '' },
      fitLine: '',
      isActive: true, showInCarousel: true, pickable: true
    },
    {
      id: 'flavia',
      firstName: 'Flavia', lastName: 'Aguilera', displayName: 'Flavia Aguilera',
      title: 'Realtor®', role: 'agent',
      photoUrl: 'images/flavia-aguilera.jpg', photoPortrait: '',
      specialties: [], marketAreas: [], languages: ['English', 'Spanish'],
      hours: '', bestFor: '', license: '', social: { instagram: '', tiktok: '' },
      fitLine: '',
      isActive: true, showInCarousel: true, pickable: true
    },
    {
      id: 'roosevelt',
      firstName: 'Roosevelt', lastName: 'Sanchez', displayName: 'Roosevelt Sanchez',
      title: 'Realtor®', role: 'agent',
      photoUrl: 'images/roosevelt-sanchez.jpg', photoPortrait: '',
      specialties: [], marketAreas: [], languages: ['English', 'Spanish'],
      hours: '', bestFor: '', license: '', social: { instagram: '', tiktok: '' },
      fitLine: '',
      isActive: true, showInCarousel: true, pickable: true
    }
  ]
};
