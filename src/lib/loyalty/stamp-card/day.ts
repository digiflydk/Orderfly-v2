// Calendar day in Copenhagen (YYYY-MM-DD). Safe for client and server code.
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit' });
export const copenhagenDay = (at: number) => dayFormat.format(new Date(at));
