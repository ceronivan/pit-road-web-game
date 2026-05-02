// zoom=2 → every 1 game-px = 2 screen-px
// Target screen sizes: labels 14px, body 16–18px, titles 20–22px
const FONT = "'Open Sans', sans-serif";

export const estilos = {
    titulo:     { fontSize: '11px', fontFamily: FONT, color: '#ffcc00', fontStyle: 'bold' },   // 22px screen
    subtitulo:  { fontSize: '10px', fontFamily: FONT, color: '#7ab8e8' },                       // 20px screen
    normal:     { fontSize: '9px',  fontFamily: FONT, color: '#d0e8ff' },                       // 18px screen
    muted:      { fontSize: '8px',  fontFamily: FONT, color: '#5888a8' },                       // 16px screen
    dim:        { fontSize: '7px',  fontFamily: FONT, color: '#334455' },                       // 14px screen
    destacado:  { fontSize: '14px', fontFamily: FONT, color: '#ffcc00', fontStyle: 'bold' },   // 28px screen
    enorme:     { fontSize: '20px', fontFamily: FONT, color: '#ffcc00', fontStyle: 'bold' },   // 40px screen
    peligro:    { fontSize: '10px', fontFamily: FONT, color: '#ff4455', fontStyle: 'bold' },   // 20px screen
    exito:      { fontSize: '9px',  fontFamily: FONT, color: '#4cdf80' },                       // 18px screen
    metricas:   { fontSize: '9px',  fontFamily: FONT, color: '#c0d8f0', lineSpacing: 2 },       // 18px screen
    cardLabel:  { fontSize: '7px',  fontFamily: FONT, color: '#4a7898' },                       // 14px screen ← user's max
    cardValue:  { fontSize: '9px',  fontFamily: FONT, color: '#e0f0ff', fontStyle: 'bold' },   // 18px screen
    sectorTag:  { fontSize: '9px',  fontFamily: FONT, color: '#ffffff', fontStyle: 'bold' },   // 18px screen
} as const;

// ── Color constants (hex numbers) ─────────────────────────────────────────────
export const COLOR = {
    BG:          0x08111e,
    CARD_BG:     0x0d1c2e,
    CARD_BG_ALT: 0x0a1520,
    CARD_BORDER: 0x1e3450,
    HEADER_BG:   0x060e1a,
    STRIP_BG:    0x060e1a,

    ACCEL:       0xe05828,
    SPEED:       0x8050e0,
    HANDL:       0x28b878,

    SECTOR_S1:   0x50c860,
    SECTOR_S2:   0x5070e0,
    SECTOR_S3:   0xe06040,
    SECTOR_S4:   0xe0b040,

    COMUN:       0x888888,
    RARA:        0x4488ff,
    EPICA:       0xffcc00,

    BTN_GREEN:   0x0f3520,
    BTN_GREEN_H: 0x1a5530,
    BTN_RED:     0x3a0f0f,
    BTN_RED_H:   0x552020,
} as const;
