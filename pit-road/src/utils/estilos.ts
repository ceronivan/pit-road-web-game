const FONT = "'Open Sans', sans-serif";

export const estilos = {
    titulo:    { fontSize: '16px', fontFamily: FONT, color: '#ffcc00', fontStyle: 'bold' },
    subtitulo: { fontSize: '14px', fontFamily: FONT, color: '#ffcc00' },
    normal:    { fontSize: '12px', fontFamily: FONT, color: '#ffffff' },
    muted:     { fontSize: '12px', fontFamily: FONT, color: '#888888' },
    dim:       { fontSize: '12px', fontFamily: FONT, color: '#555555' },
    destacado: { fontSize: '20px', fontFamily: FONT, color: '#ffcc00', fontStyle: 'bold' },
    peligro:   { fontSize: '14px', fontFamily: FONT, color: '#ff4444', fontStyle: 'bold' },
    exito:     { fontSize: '12px', fontFamily: FONT, color: '#aaffaa' },
    metricas:  { fontSize: '12px', fontFamily: FONT, color: '#cccccc', lineSpacing: 6 },
} as const;
