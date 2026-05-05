export const P = {
    bg: '#F5F5F1',
    surface: '#FFFFFF',
    ink: '#0B0E14',
    ink2: '#4A4E5A',
    ink3: '#8A8E99',
    line: '#E8E6DE',
    primary: '#2F4BFF',
    primarySoft: '#E6EAFF',
    onPrimary: '#FFFFFF',
    lime: '#D8F26A',
    limeInk: '#24300A',
    coral: '#FF8068',
    coralSoft: '#FFE4DC',
    coralDeep: '#C24A30',
    violet: '#A58BFF',
    violetSoft: '#ECE4FF',
    violetDeep: '#5C3FD6',
    mint: '#9DE8C8',
    mintSoft: '#DFF6EB',
    mintDeep: '#1F6F4C',
    amber: '#FFC657',
    amberSoft: '#FFF4D6',
    amberDeep: '#8A5B10',
};
export const FONT = `'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif`;
export const MONO = `'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace`;
const COLOR_CYCLE = [
    { bg: P.primarySoft, fg: P.primary, solid: P.primary },
    { bg: P.coralSoft, fg: P.coralDeep, solid: P.coral },
    { bg: P.violetSoft, fg: P.violetDeep, solid: P.violet },
    { bg: P.mintSoft, fg: P.mintDeep, solid: P.mint },
    { bg: P.amberSoft, fg: P.amberDeep, solid: P.amber },
];
export function moduleColor(code) {
    let h = 0;
    for (let i = 0; i < code.length; i++)
        h = (h * 31 + code.charCodeAt(i)) >>> 0;
    return COLOR_CYCLE[h % COLOR_CYCLE.length];
}
export function toneColors(tone) {
    switch (tone) {
        case 'ok': return { bg: P.mintSoft, fg: P.mintDeep };
        case 'warn': return { bg: P.amberSoft, fg: P.amberDeep };
        case 'risk': return { bg: P.coralSoft, fg: P.coralDeep };
        case 'primary': return { bg: P.primarySoft, fg: P.primary };
        case 'lime': return { bg: P.lime, fg: P.limeInk };
        case 'muted':
        default: return { bg: '#EFEDE5', fg: P.ink2 };
    }
}
