package com.compoundcalc.lambda;

import org.junit.Test;
import static org.junit.Assert.*;
import com.compoundcalc.lambda.ResultCacheService;

public class CompoundInterestHandlerTest {

    private static final double DELTA = 0.01;

    @Test
    public void testAnnualCompounding() {
        // P=10000, r=5%, t=10, n=1 => A = 10000 * (1.05)^10 = 16288.95
        double result = CompoundInterestHandler.calculateCompoundInterest(10000, 5.0, 10, 1);
        assertEquals(16288.95, result, DELTA);
    }

    @Test
    public void testMonthlyCompounding() {
        // P=10000, r=5.5%, t=10, n=12 => A = 10000 * (1 + 0.055/12)^(12*10)
        double result = CompoundInterestHandler.calculateCompoundInterest(10000, 5.5, 10, 12);
        double expected = 10000 * Math.pow(1 + 0.055 / 12.0, 12.0 * 10);
        expected = Math.round(expected * 100.0) / 100.0;
        assertEquals(expected, result, DELTA);
    }

    @Test
    public void testDailyCompounding() {
        // P=5000, r=3%, t=5, n=365
        double result = CompoundInterestHandler.calculateCompoundInterest(5000, 3.0, 5, 365);
        double expected = 5000 * Math.pow(1 + 0.03 / 365.0, 365.0 * 5);
        expected = Math.round(expected * 100.0) / 100.0;
        assertEquals(expected, result, DELTA);
    }

    @Test
    public void testQuarterlyCompounding() {
        // P=1000, r=10%, t=1, n=4 => A = 1000 * (1 + 0.1/4)^4 = 1103.81
        double result = CompoundInterestHandler.calculateCompoundInterest(1000, 10.0, 1, 4);
        assertEquals(1103.81, result, DELTA);
    }

    @Test
    public void testSemiAnnualCompounding() {
        // P=25000, r=8%, t=20, n=2
        double result = CompoundInterestHandler.calculateCompoundInterest(25000, 8.0, 20, 2);
        double expected = 25000 * Math.pow(1 + 0.08 / 2.0, 2.0 * 20);
        expected = Math.round(expected * 100.0) / 100.0;
        assertEquals(expected, result, DELTA);
    }

    @Test
    public void testZeroRate() {
        // P=10000, r=0%, t=10, n=12 => A = 10000 (no growth)
        double result = CompoundInterestHandler.calculateCompoundInterest(10000, 0.0, 10, 12);
        assertEquals(10000.00, result, DELTA);
    }

    @Test
    public void testOneYear() {
        // P=1000, r=12%, t=1, n=12 => A = 1000 * (1 + 0.01)^12 = 1126.83
        double result = CompoundInterestHandler.calculateCompoundInterest(1000, 12.0, 1, 12);
        assertEquals(1126.83, result, DELTA);
    }

    @Test
    public void testLargePrincipal() {
        // P=1,000,000, r=7%, t=30, n=12
        double result = CompoundInterestHandler.calculateCompoundInterest(1000000, 7.0, 30, 12);
        double expected = 1000000 * Math.pow(1 + 0.07 / 12.0, 12.0 * 30);
        expected = Math.round(expected * 100.0) / 100.0;
        assertEquals(expected, result, DELTA);
    }

    // --- Cache Key Tests ---

    @Test
    public void testCacheKeyDeterministic() {
        String key1 = ResultCacheService.cacheKey(10000, 5.5, 10, 12);
        String key2 = ResultCacheService.cacheKey(10000, 5.5, 10, 12);
        assertEquals(key1, key2);
    }

    @Test
    public void testCacheKeyDifferentInputs() {
        String key1 = ResultCacheService.cacheKey(10000, 5.5, 10, 12);
        String key2 = ResultCacheService.cacheKey(20000, 5.5, 10, 12);
        assertNotEquals(key1, key2);
    }

    @Test
    public void testCacheKeyIsSha256() {
        String key = ResultCacheService.cacheKey(10000, 5.5, 10, 12);
        assertEquals(64, key.length()); // SHA-256 hex = 64 chars
        assertTrue(key.matches("[0-9a-f]+"));
    }
}
