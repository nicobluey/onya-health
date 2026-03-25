export function formatPublishedDate(isoDate: string): string {
    return new Date(isoDate).toLocaleDateString('en-AU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}
