import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/supabaseClient', () => ({ supabase: { rpc: async () => ({ data: null, error: null }) } }));
const rules = await import('../src/bookingRules');
const { cancellationDeadline, downpaymentFor, salePriceOf } = await import('../src/tourUtils');

describe('booking rules', () => {
  it('starts with the values the website used before', () => {
    expect(rules.CANCELLATION_CUTOFF_DAYS).toBe(14);
    expect(rules.DOWNPAYMENT_PERCENT).toBe(50);
    expect(rules.SALE_DISCOUNT).toBeCloseTo(0.05);
  });

  it('applies new rules everywhere they are imported', () => {
    rules.applyBookingRules({ cancellation_cutoff_days: 7, downpayment_percent: 30, sale_discount_percent: 10 });
    expect(rules.CANCELLATION_CUTOFF_DAYS).toBe(7);
    expect(downpaymentFor(1000)).toBe(300);
    expect(salePriceOf(1000)).toBe(900);
    expect(cancellationDeadline('2027-01-20')).toBe('2027-01-13');
    rules.applyBookingRules(rules.DEFAULT_RULES);
  });

  it('ignores missing, blank or negative values', () => {
    rules.applyBookingRules({ downpayment_percent: -5, cancellation_cutoff_days: '', max_vans: null });
    expect(rules.DOWNPAYMENT_PERCENT).toBe(50);
    expect(rules.CANCELLATION_CUTOFF_DAYS).toBe(14);
    expect(rules.MAX_VANS).toBe(5);
  });

  it('keeps the rules a booking was made under', () => {
    rules.applyBookingRules({ ...rules.DEFAULT_RULES, cancellation_cutoff_days: 7, weather_refund_percent: 30 });
    const old = { rule_cancel_days: 14, rule_downpayment_percent: 50, rule_weather_refund_percent: 50 };
    expect(rules.cancelDaysOf(old)).toBe(14);
    expect(rules.weatherRefundPercentOf(old)).toBe(50);
    expect(rules.cancelDaysOf({})).toBe(7);
    expect(cancellationDeadline('2027-01-20', rules.cancelDaysOf(old))).toBe('2027-01-06');
    rules.applyBookingRules(rules.DEFAULT_RULES);
  });

  it('writes durations the way people say them', () => {
    expect(rules.periodText(21)).toBe('3 weeks');
    expect(rules.periodText(7)).toBe('1 week');
    expect(rules.periodText(10)).toBe('10 days');
    expect(rules.holdText(48)).toBe('2 days');
    expect(rules.minutesText(30)).toBe('30 minutes');
    expect(rules.minutesText(90)).toBe('1 hour 30 minutes');
  });
});
