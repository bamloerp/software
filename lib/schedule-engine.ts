export type TaskType = 'excavation' | 'brick' | 'plaster' | 'cubic' | 'tiler';

export interface ProductivitySettings {
    builderShare: number;
    excavationBuilder: number;
    excavationAssistant: number;
    brickBuilder: number;
    brickAssistant: number;
    plasterBuilder: number;
    plasterAssistant: number;
    cubicBuilder: number;
    cubicAssistant: number;
    tilerBuilder: number;
    tilerAssistant: number;
}

export interface ScheduleItemMinimal {
    id?: string | null;
    title: string;
    description?: string | null;
    unit?: string | null;
    quantity?: number | null;
    plannedStart?: string | Date | null;
    plannedEnd?: string | Date | null;
    employees?: number | null;
    estHours?: number | null;
    employeeIds?: string[];
    status?: string;
    hasConflict?: boolean;
    conflictNote?: string | null;
}

export const WORK_START_HOUR = 7;
export const WORK_END_HOUR = 17;
export const HOURS_PER_DAY = WORK_END_HOUR - WORK_START_HOUR; // 10 hours

/**
 * Infers task type from unit and description
 */
export function inferTaskType(unit?: string | null, description?: string | null): TaskType | null {
    const u = (unit || '').toLowerCase();
    const d = (description || '').toLowerCase();
    if (d.includes('tile') || d.includes('tiling')) return 'tiler';
    if (u.includes('m3') || u.includes('cubic')) return 'cubic';
    if (u.includes('m2') || u.includes('sqm') || d.includes('plaster')) return 'plaster';
    if (u.includes('brick') || d.includes('brick')) return 'brick';
    if (u === 'm' || d.includes('excav')) return 'excavation';
    return null;
}

/**
 * Adds working time to a start date, skipping weekends and working hours.
 */
export function addWorkingTime(startDate: Date | string, hours: number): Date {
    let remainingHours = hours;
    let date = new Date(startDate);

    // Initial cleanup: if we start at 00:00, move to 07:00
    if (date.getHours() < WORK_START_HOUR) {
        date.setHours(WORK_START_HOUR, 0, 0, 0);
    }

    while (remainingHours > 0) {
        // Skip weekends (Sat=6, Sun=0)
        const day = date.getDay();
        if (day === 0 || day === 6) {
            date.setDate(date.getDate() + (day === 6 ? 2 : 1));
            date.setHours(WORK_START_HOUR, 0, 0, 0);
            continue;
        }

        // Work day boundaries
        const workEnd = new Date(date);
        workEnd.setHours(WORK_END_HOUR, 0, 0, 0);

        // If past work hours, move to next day 07:00
        if (date.getHours() >= WORK_END_HOUR) {
            date.setDate(date.getDate() + 1);
            date.setHours(WORK_START_HOUR, 0, 0, 0);
            continue;
        }

        const msRemainingToday = workEnd.getTime() - date.getTime();
        const hoursRemainingToday = msRemainingToday / (1000 * 60 * 60);

        if (hoursRemainingToday >= remainingHours) {
            date.setTime(date.getTime() + remainingHours * 60 * 60 * 1000);
            remainingHours = 0;
        } else {
            remainingHours -= hoursRemainingToday;
            date.setDate(date.getDate() + 1);
            date.setHours(WORK_START_HOUR, 0, 0, 0);
        }
    }
    return date;
}

/**
 * Adds a gap (in minutes) between tasks, respecting weekends and work hours.
 */
export function addGap(date: Date, minutes: number): Date {
    let newDate = new Date(date.getTime() + minutes * 60000);
    const endOfDay = new Date(newDate);
    endOfDay.setHours(WORK_END_HOUR, 0, 0, 0);

    if (newDate >= endOfDay) {
        newDate.setDate(newDate.getDate() + 1);
        newDate.setHours(WORK_START_HOUR, 0, 0, 0);
    }

    // Final check for weekends
    while (newDate.getDay() === 0 || newDate.getDay() === 6) {
        newDate.setDate(newDate.getDate() + 1);
        newDate.setHours(WORK_START_HOUR, 0, 0, 0);
    }

    if (newDate.getHours() < WORK_START_HOUR) {
        newDate.setHours(WORK_START_HOUR, 0, 0, 0);
    }

    return newDate;
}

/**
 * Calculates duration in hours based on productivity settings.
 */
export function calculateDuration(
    item: ScheduleItemMinimal,
    productivity: ProductivitySettings
): number {
    const type = inferTaskType(item.unit, item.description);
    const qty = Number(item.quantity ?? 0);
    const numEmployees = item.employees || item.employeeIds?.length || 0;

    if (type && qty > 0 && numEmployees > 0) {
        const builders = Math.max(1, Math.round(numEmployees * productivity.builderShare));
        const assistants = Math.max(0, numEmployees - builders);

        const rates = (() => {
            switch (type) {
                case 'excavation': return { b: productivity.excavationBuilder, a: productivity.excavationAssistant };
                case 'brick': return { b: productivity.brickBuilder, a: productivity.brickAssistant };
                case 'plaster': return { b: productivity.plasterBuilder, a: productivity.plasterAssistant };
                case 'cubic': return { b: productivity.cubicBuilder, a: productivity.cubicAssistant };
                case 'tiler': return { b: productivity.tilerBuilder, a: productivity.tilerAssistant };
                default: return { b: 0, a: 0 };
            }
        })();

        const dailyOutput = builders * rates.b + assistants * rates.a;
        if (dailyOutput > 0) {
            const days = qty / dailyOutput;
            return days * HOURS_PER_DAY;
        }
    }

    return item.estHours || HOURS_PER_DAY; // Default to 1 day if not calculable
}

/**
 * Recalculates a sequence of schedule items starting from a specific index.
 */
export function recalculateRipple(
    items: ScheduleItemMinimal[],
    startIndex: number,
    startAt: Date,
    gapMinutes: number,
    productivity: ProductivitySettings
): ScheduleItemMinimal[] {
    const result = [...items];
    let currentStart = new Date(startAt);

    for (let i = startIndex; i < result.length; i++) {
        const item = result[i];
        const duration = calculateDuration(item, productivity);

        const start = new Date(currentStart);
        const end = addWorkingTime(start, duration);

        result[i] = {
            ...item,
            plannedStart: start.toISOString().slice(0, 10),
            plannedEnd: end.toISOString().slice(0, 10),
            estHours: Number(duration.toFixed(2)),
            employees: item.employeeIds?.length || item.employees,
        };

        currentStart = addGap(end, gapMinutes);
    }

    return result;
}
