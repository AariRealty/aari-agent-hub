/* ============================================================================
   Aari Realty · agent roster — THE single source of truth.
   Drives the directory on agents.html, the strip on the homepage, and the agent
   pre-selected on the contact form. Built to scale: add rows and everything
   picks them up, no other file changes.

   THE ONLY TWO FIELDS YOU NEED TO FILL IN RIGHT NOW
   -------------------------------------------------
     blurb   One or two sentences, in that agent's voice. This is what shows on
             their card and it's what people actually read. ~120-160 characters
             reads best; longer is fine, the card clamps it.
     tags    2-4 short words for search and the filter chips. Areas they work,
             languages, what they're good at. Lowercase is fine.

   READY FOR LATER, LEAVE BLANK FOR NOW
   ------------------------------------
     video        An intro video URL (mp4, or a Vimeo/YouTube embed URL).
                  When present the card shows a play badge and the detail panel
                  plays it instead of the photo. Nothing breaks while it's empty.
     videoPoster  A still for the video. Falls back to photoPortrait.

   BEFORE LAUNCH: confirm each person is currently affiliated and their Florida
   license is active and on file. Set isActive:false to hide someone without
   deleting the row.

   EVERYONE HERE IS A LICENSED REALTOR. `title` is the primary line; `badge` is
   the second hat where someone wears one — Marlenyi is the Broker, Eileen and
   Milennys also run transaction coordination. Leave `badge` empty for everyone
   else.
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
      badge: 'Realtor\u00ae',
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
      blurb: 'I built Aari so no one gets handed a contract they do not understand. If you want the broker herself, and you want to be told the truth about your number, that is me.',
      tags: ['lehigh acres', 'fort myers', 'cape coral', 'naples', 'spanish', 'pricing strategy', 'compliance'],
      video: '', videoPoster: '',
      isActive: true, showInCarousel: true, pickable: true
    },
    {
      id: 'alejandro',
      firstName: 'Alejandro', lastName: 'Paredes', displayName: 'Alejandro Paredes',
      title: 'Realtor®', badge: '', role: 'agent',
      photoUrl: 'images/alejandro-paredes.jpg', photoPortrait: '',
      specialties: [], marketAreas: [], languages: ['English', 'Spanish'],
      hours: '', bestFor: '', license: '', social: { instagram: '', tiktok: '' },
      fitLine: '',
      blurb: '',            /* <- write this */
      tags: [],             /* <- and this: ['lehigh acres','spanish','first-time buyers'] */
      video: '', videoPoster: '',
      isActive: true, showInCarousel: true, pickable: true
    },
    {
      id: 'odalis',
      firstName: 'Odalis', lastName: 'Mora', displayName: 'Odalis Mora',
      title: 'Realtor®', badge: '', role: 'agent',
      photoUrl: 'images/odalis-mora.jpg', photoPortrait: '',
      specialties: [], marketAreas: [], languages: ['English', 'Spanish'],
      hours: '', bestFor: '', license: '', social: { instagram: '', tiktok: '' },
      fitLine: '',
      blurb: '',            /* <- write this */
      tags: [],             /* <- and this: ['lehigh acres','spanish','first-time buyers'] */
      video: '', videoPoster: '',
      isActive: true, showInCarousel: true, pickable: true
    },
    {
      id: 'alied',
      firstName: 'Alied', lastName: 'Machuca', displayName: 'Alied Machuca',
      title: 'Realtor®', badge: '', role: 'agent',
      photoUrl: 'images/alied-machuca.jpg', photoPortrait: '',
      specialties: [], marketAreas: [], languages: ['English', 'Spanish'],
      hours: '', bestFor: '', license: '', social: { instagram: '', tiktok: '' },
      fitLine: '',
      blurb: '',            /* <- write this */
      tags: [],             /* <- and this: ['lehigh acres','spanish','first-time buyers'] */
      video: '', videoPoster: '',
      isActive: true, showInCarousel: true, pickable: true
    },
    {
      id: 'ana',
      firstName: 'Ana', lastName: 'Puentes', displayName: 'Ana Puentes',
      title: 'Realtor®', badge: '', role: 'agent',
      photoUrl: 'images/ana-puentes.jpg', photoPortrait: '',
      specialties: [], marketAreas: [], languages: ['English', 'Spanish'],
      hours: '', bestFor: '', license: '', social: { instagram: '', tiktok: '' },
      fitLine: '',
      blurb: '',            /* <- write this */
      tags: [],             /* <- and this: ['lehigh acres','spanish','first-time buyers'] */
      video: '', videoPoster: '',
      isActive: true, showInCarousel: true, pickable: true
    },
    {
      id: 'flavia',
      firstName: 'Flavia', lastName: 'Aguilera', displayName: 'Flavia Aguilera',
      title: 'Realtor®', badge: '', role: 'agent',
      photoUrl: 'images/flavia-aguilera.jpg', photoPortrait: '',
      specialties: [], marketAreas: [], languages: ['English', 'Spanish'],
      hours: '', bestFor: '', license: '', social: { instagram: '', tiktok: '' },
      fitLine: '',
      blurb: '',            /* <- write this */
      tags: [],             /* <- and this: ['lehigh acres','spanish','first-time buyers'] */
      video: '', videoPoster: '',
      isActive: true, showInCarousel: true, pickable: true
    },
    {
      id: 'roosevelt',
      firstName: 'Roosevelt', lastName: 'Sanchez', displayName: 'Roosevelt Sanchez',
      title: 'Realtor®', badge: '', role: 'agent',
      photoUrl: 'images/roosevelt-sanchez.jpg', photoPortrait: '',
      specialties: [], marketAreas: [], languages: ['English', 'Spanish'],
      hours: '', bestFor: '', license: '', social: { instagram: '', tiktok: '' },
      fitLine: '',
      blurb: '',            /* <- write this */
      tags: [],             /* <- and this: ['lehigh acres','spanish','first-time buyers'] */
      video: '', videoPoster: '',
      isActive: true, showInCarousel: true, pickable: true
    },
    {
      id: 'eileen',
      firstName: 'Eileen', lastName: 'Hernandez', displayName: 'Eileen Hernandez',
      title: 'Realtor\u00ae', badge: 'Transaction Coordinator', role: 'agent_tc',
      photoUrl: 'images/eileen-hernandez.jpg', photoPortrait: '',
      blurb: '',            /* <- write this */
      tags: [],             /* <- and this */
      video: '', videoPoster: '',
      specialties: [], marketAreas: [], languages: ['English', 'Spanish'],
      hours: '', bestFor: '', license: '', social: { instagram: '', tiktok: '' },
      fitLine: '',
      isActive: true, showInCarousel: true, pickable: true
    },
    {
      id: 'milennys',
      firstName: 'Milennys', lastName: 'Vargas', displayName: 'Milennys Vargas',
      title: 'Realtor\u00ae', badge: 'Transaction Coordinator', role: 'agent_tc',
      photoUrl: 'images/milennys-vargas.jpg', photoPortrait: '',
      blurb: '',            /* <- write this */
      tags: [],             /* <- and this */
      video: '', videoPoster: '',
      specialties: [], marketAreas: [], languages: ['English', 'Spanish'],
      hours: '', bestFor: '', license: '', social: { instagram: '', tiktok: '' },
      fitLine: '',
      isActive: true, showInCarousel: true, pickable: true
    }
  ]
};
