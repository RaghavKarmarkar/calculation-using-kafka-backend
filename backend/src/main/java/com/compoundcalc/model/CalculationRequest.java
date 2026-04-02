package com.compoundcalc.model;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public class CalculationRequest {

    @NotNull(message = "Principal is required")
    @Positive(message = "Principal must be positive")
    private Double principal;

    @NotNull(message = "Annual rate is required")
    @Min(value = 0, message = "Rate must be non-negative")
    @Max(value = 100, message = "Rate must be at most 100")
    private Double annualRate;

    @NotNull(message = "Years is required")
    @Min(value = 1, message = "Years must be at least 1")
    @Max(value = 100, message = "Years must be at most 100")
    private Integer years;

    @NotNull(message = "Compounding frequency is required")
    @Min(value = 1, message = "Compounding frequency must be at least 1")
    private Integer compoundingFrequency;

    public CalculationRequest() {}

    public CalculationRequest(Double principal, Double annualRate, Integer years, Integer compoundingFrequency) {
        this.principal = principal;
        this.annualRate = annualRate;
        this.years = years;
        this.compoundingFrequency = compoundingFrequency;
    }

    public Double getPrincipal() { return principal; }
    public void setPrincipal(Double principal) { this.principal = principal; }

    public Double getAnnualRate() { return annualRate; }
    public void setAnnualRate(Double annualRate) { this.annualRate = annualRate; }

    public Integer getYears() { return years; }
    public void setYears(Integer years) { this.years = years; }

    public Integer getCompoundingFrequency() { return compoundingFrequency; }
    public void setCompoundingFrequency(Integer compoundingFrequency) { this.compoundingFrequency = compoundingFrequency; }
}
