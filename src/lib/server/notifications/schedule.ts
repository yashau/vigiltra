import type { ThresholdSchedule } from '../db/schema';

const DAY_MS = 86_400_000;

export function daysUntilExpiry(end: Date, now: Date): number {
	const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
	const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	return Math.floor((endUtc - nowUtc) / DAY_MS);
}

export function shouldFireToday(
	end: Date | null,
	schedule: ThresholdSchedule,
	now: Date = new Date()
): boolean {
	if (!end) return false;
	const days = daysUntilExpiry(end, now);
	if (days < 0) return schedule.notify_past_expiry;
	return schedule.fires.includes(days);
}
