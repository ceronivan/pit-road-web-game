const FONT = "'Open Sans', sans-serif";

// ── Text style palette ────────────────────────────────────────────────────────
export const estilos = {
    titulo:     { fontSize: '16px', fontFamily: FONT, color: '#ffcc00', fontStyle: 'bold' },
    subtitulo:  { fontSize: '14px', fontFamily: FONT, color: '#7ab8e8' },
    normal:     { fontSize: '12px', fontFamily: FONT, color: '#d0e8ff' },
    muted:      { fontSize: '12px', fontFamily: FONT, color: '#5888a8' },
    dim:        { fontSize: '12px', fontFamily: FONT, color: '#334455' },
    destacado:  { fontSize: '22px', fontFamily: FONT, color: '#ffcc00', fontStyle: 'bold' },
    enorme:     { fontSize: '36px', fontFamily: FONT, color: '#ffcc00', fontStyle: 'bold' },
    peligro:    { fontSize: '14px', fontFamily: FONT, color: '#ff4455', fontStyle: 'bold' },
    exito:      { fontSize: '12px', fontFamily: FONT, color: '#4cdf80' },
    metricas:   { fontSize: '12px', fontFamily: FONT, color: '#c0d8f0', lineSpacing: 4 },
    cardLabel:  { fontSize: '12px', fontFamily: FONT, color: '#4a7898' },
    cardValue:  { fontSize: '14px', fontFamily: FONT, color: '#e0f0ff', fontStyle: 'bold' },
    sectorTag:  { fontSize: '12px', fontFamily: FONT, color: '#ffffff', fontStyle: 'bold' },
} as const;

// ── Color constants (hex numbers) ─────────────────────────────────────────────
export const COLOR = {
    BG:          0x08111e,
    CARD_BG:     0x0d1c2e,
    CARD_BG_ALT: 0x0a1520,
    CARD_BORDER: 0x1e3450,
    HEADER_BG:   0x060e1a,
    STRIP_BG:    0x060e1a,

    ACCEL:       0xe05828,   // orange-red
    SPEED:       0x8050e0,   // purple-blue
    HANDL:       0x28b878,   // emerald

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
