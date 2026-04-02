package com.compoundcalc.model;

public class CalculationResponse {

    private String calculationId;
    private String status;
    private Double principal;
    private Double annualRate;
    private Integer years;
    private Integer compoundingFrequency;
    private Double finalAmount;
    private String errorMessage;
    private Long createdAt;
    private Long completedAt;

    public CalculationResponse() {}

    public String getCalculationId() { return calculationId; }
    public void setCalculationId(String calculationId) { this.calculationId = calculationId; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Double getPrincipal() { return principal; }
    public void setPrincipal(Double principal) { this.principal = principal; }

    public Double getAnnualRate() { return annualRate; }
    public void setAnnualRate(Double annualRate) { this.annualRate = annualRate; }

    public Integer getYears() { return years; }
    public void setYears(Integer years) { this.years = years; }

    public Integer getCompoundingFrequency() { return compoundingFrequency; }
    public void setCompoundingFrequency(Integer compoundingFrequency) { this.compoundingFrequency = compoundingFrequency; }

    public Double getFinalAmount() { return finalAmount; }
    public void setFinalAmount(Double finalAmount) { this.finalAmount = finalAmount; }

    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }

    public Long getCreatedAt() { return createdAt; }
    public void setCreatedAt(Long createdAt) { this.createdAt = createdAt; }

    public Long getCompletedAt() { return completedAt; }
    public void setCompletedAt(Long completedAt) { this.completedAt = completedAt; }
}
