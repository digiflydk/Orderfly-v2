export function formatPrice(amount: number): string {
    return `${new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} kr.`;
}
export function localizeTime(value: string): string {
    return value.replace(/Tomorrow/g, 'I morgen').replace(/Today/g, 'I dag')
        .replace(/ASAP/g, 'Hurtigst muligt').replace(/Currently unavailable/g, 'Ingen ledige tider')
        .replace(/Loading\.\.\./g, 'Indlæser…');
}
