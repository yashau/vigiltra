export type ExpiryBucket = 'expired' | 'critical' | 'warning' | 'soon' | 'ok' | 'none';

const DAY_MS = 86_400_000;

export function daysUntil(end: Date | null, now: Date = new Date()): number | null {
	if (!end) return null;
	return Math.floor((end.getTime() - now.getTime()) / DAY_MS);
}

export function expiryBucket(end: Date | null, now: Date = new Date()): ExpiryBucket {
	const d = daysUntil(end, now);
	if (d === null) return 'none';
	if (d < 0) return 'expired';
	if (d <= 7) return 'critical';
	if (d <= 30) return 'warning';
	if (d <= 90) return 'soon';
	return 'ok';
}

export function formatExpiry(end: Date | null, now: Date = new Date()): string {
	if (!end) return 'No expiry';
	const d = daysUntil(end, now);
	if (d === null) return 'No expiry';
	if (d < 0) return `Expired ${Math.abs(d)}d ago`;
	if (d === 0) return 'Expires today';
	if (d === 1) return 'Expires tomorrow';
	return `In ${d}d`;
}

export function formatDate(d: Date | null): string {
	if (!d) return '—';
	return d.toISOString().slice(0, 10);
}
