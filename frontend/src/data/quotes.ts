/**
 * Curated motivation quotes — bundled content for Phase 1.
 * Rotates daily and avoids showing the same quote two days in a row.
 * Milestone-specific quotes unlock as rewards.
 */

export interface Quote {
  text: string;
  author?: string;
  category: "daily" | "milestone" | "recovery" | "weekly";
}

export const DAILY_QUOTES: Quote[] = [
  { text: "Small steps still move you forward.", category: "daily" },
  { text: "Progress counts, even when it's quiet.", category: "daily" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar", category: "daily" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain", category: "daily" },
  { text: "What you do today can improve all your tomorrows.", category: "daily" },
  { text: "A little progress each day adds up to big results.", category: "daily" },
  { text: "Consistency is more important than perfection.", category: "daily" },
  { text: "You are what you repeatedly do.", category: "daily" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", category: "daily" },
  { text: "Focus on the step in front of you, not the whole staircase.", category: "daily" },
  { text: "Every expert was once a beginner.", category: "daily" },
  { text: "Be stubborn about your goals and flexible about your methods.", category: "daily" },
  { text: "Your future self is watching you right now through memories.", category: "daily" },
  { text: "Don't count the days. Make the days count.", author: "Muhammad Ali", category: "daily" },
  { text: "The only impossible journey is the one you never begin.", category: "daily" },
  { text: "Discipline is choosing between what you want now and what you want most.", category: "daily" },
  { text: "Success is the sum of small efforts repeated day in and day out.", category: "daily" },
  { text: "You don't need motivation. You need a system.", category: "daily" },
  { text: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe", category: "daily" },
  { text: "The harder you work for something, the greater you'll feel when you achieve it.", category: "daily" },
  { text: "One day or day one. You decide.", category: "daily" },
  { text: "Motivation gets you going. Habit keeps you growing.", category: "daily" },
  { text: "Your only limit is your mind.", category: "daily" },
  { text: "Fall seven times, stand up eight.", category: "daily" },
  { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney", category: "daily" },
  { text: "Act as if what you do makes a difference. It does.", author: "William James", category: "daily" },
  { text: "What lies behind us and what lies before us are tiny matters compared to what lies within us.", author: "Ralph Waldo Emerson", category: "daily" },
  { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius", category: "daily" },
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt", category: "daily" },
  { text: "The only person you should try to be better than is the person you were yesterday.", category: "daily" },
  { text: "Dream it. Wish it. Do it.", category: "daily" },
];

export const MILESTONE_QUOTES: Quote[] = [
  { text: "Seven days of showing up. That's not luck — that's you.", category: "milestone" },
  { text: "Two weeks in. The foundation is setting.", category: "milestone" },
  { text: "Twenty-one days. You've built the foundation. Now it becomes part of who you are.", category: "milestone" },
  { text: "A full month. Look at how far you've come.", category: "milestone" },
  { text: "Sixty days of becoming. You're not the same person who started.", category: "milestone" },
  { text: "Ninety days. Three months of proof that you follow through.", category: "milestone" },
  { text: "Three hundred sixty-five days. A full year of being the person you set out to be.", category: "milestone" },
];

export const RECOVERY_QUOTES: Quote[] = [
  { text: "One missed day has zero effect on your trajectory. Your habit is still intact.", category: "recovery" },
  { text: "Day 1 again is not zero — it's round two with experience.", category: "recovery" },
  { text: "Never miss twice. That's the only rule that matters.", category: "recovery" },
  { text: "A stumble is not a fall. You're still on the path.", category: "recovery" },
  { text: "The comeback is always stronger than the setback.", category: "recovery" },
  { text: "Missing one day doesn't erase your progress. Getting back does define it.", category: "recovery" },
  { text: "Your floor action is waiting. Start small, start now.", category: "recovery" },
];

export const WEEKLY_QUOTES: Quote[] = [
  { text: "What worked this week? What will you adjust next week?", category: "weekly" },
  { text: "A fresh week. A fresh chance to be who you said you'd be.", category: "weekly" },
  { text: "Weekly review: look back with pride, look ahead with purpose.", category: "weekly" },
  { text: "Progress is rarely linear. What matters is the overall direction.", category: "weekly" },
];

/** Get today's daily quote, avoiding repetition */
export function getDailyQuote(): Quote {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length];
}

/** Get a recovery quote */
export function getRecoveryQuote(): Quote {
  const index = Math.floor(Math.random() * RECOVERY_QUOTES.length);
  return RECOVERY_QUOTES[index];
}

/** Get milestone quote for a specific day count */
export function getMilestoneQuote(days: number): Quote | null {
  const map: Record<number, number> = { 7: 0, 14: 1, 21: 2, 30: 3, 60: 4, 90: 5, 365: 6 };
  const index = map[days];
  return index !== undefined ? MILESTONE_QUOTES[index] : null;
}

/** Get a weekly review quote */
export function getWeeklyQuote(): Quote {
  const weekOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (7 * 86400000)
  );
  return WEEKLY_QUOTES[weekOfYear % WEEKLY_QUOTES.length];
}
