package com.compoundcalc.lambda;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class CalculationEvent {

    private String calculationId;
    private Double principal;
    private Double annualRate;
    private Integer years;
    private Integer compoundingFrequency;
    private Long createdAt;
    private String connectionId;
    private String wsCallbackUrl;

    public CalculationEvent() {}

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

    public String getConnectionId() { return connectionId; }
    public void setConnectionId(String connectionId) { this.connectionId = connectionId; }

    public String getWsCallbackUrl() { return wsCallbackUrl; }
    public void setWsCallbackUrl(String wsCallbackUrl) { this.wsCallbackUrl = wsCallbackUrl; }
}
