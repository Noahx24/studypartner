export const isoDate = (date) => date.toISOString().slice(0, 10);
export const startOfWeek = (date) => {
    const next = new Date(date);
    const day = next.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    next.setDate(next.getDate() + diff);
    return next;
};
export const prettyDate = (date) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
});
