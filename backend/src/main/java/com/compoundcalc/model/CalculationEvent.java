package com.compoundcalc.model;

import java.io.Serializable;

public class CalculationEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    private String calculationId;
    private Double principal;
    private Double annualRate;
    private Integer years;
    private Integer compoundingFrequency;
    private Long createdAt;

    public CalculationEvent() {}

    public CalculationEvent(String calculationId, Double principal, Double annualRate,
                            Integer years, Integer compoundingFrequency, Long createdAt) {
        this.calculationId = calculationId;
        this.principal = principal;
        this.annualRate = annualRate;
        this.years = years;
        this.compoundingFrequency = compoundingFrequency;
        this.createdAt = createdAt;
    }

    public String getCalculationId() { return calculationId; }
    public void setCalculationId(String calculationId) { this.calculationId = calculationId; }

    public Double getPrincipal() { return principal; }
    public void setPrincipal(Double principal) { this.principal = principal; }

    public Double getAnnualRate() { return annualRate; }
    public void setAnnualRate(Double annualRate) { this.annualRate = annualRate; }

    public Integer getYears() { return years; }
    public void setYears(Integer years) { this.years = years; }

    public Integer getCompoundingFrequency() { return compoundingFrequency; }
    public void setCompoundingFrequency(Integer compoundingFrequency) { this.compoundingFrequency = compoundingFrequency; }

    public Long getCreatedAt() { return createdAt; }
    public void setCreatedAt(Long createdAt) { this.createdAt = createdAt; }
}
