package com.compoundcalc.service;

import com.compoundcalc.model.CalculationEvent;
import com.compoundcalc.model.CalculationRequest;
import com.compoundcalc.model.CalculationResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class CalculationService {

    private static final Logger logger = LoggerFactory.getLogger(CalculationService.class);

    private final KafkaProducerService kafkaProducerService;
    private final DynamoDbService dynamoDbService;

    public CalculationService(KafkaProducerService kafkaProducerService, DynamoDbService dynamoDbService) {
        this.kafkaProducerService = kafkaProducerService;
        this.dynamoDbService = dynamoDbService;
    }

    public CalculationResponse submitCalculation(CalculationRequest request) {
        String calculationId = UUID.randomUUID().toString();
        long createdAt = System.currentTimeMillis();

        logger.info("Submitting calculation [{}]: P={}, R={}, T={}, N={}",
                calculationId, request.getPrincipal(), request.getAnnualRate(),
                request.getYears(), request.getCompoundingFrequency());

        // Save to DynamoDB with PENDING status
        dynamoDbService.saveCalculationRequest(
                calculationId,
                request.getPrincipal(),
                request.getAnnualRate(),
                request.getYears(),
                request.getCompoundingFrequency()
        );

        // Publish to Kafka
        CalculationEvent event = new CalculationEvent(
                calculationId,
                request.getPrincipal(),
                request.getAnnualRate(),
                request.getYears(),
                request.getCompoundingFrequency(),
                createdAt
        );
        kafkaProducerService.sendCalculationRequest(event);

        // Return immediate response with PENDING status
        CalculationResponse response = new CalculationResponse();
        response.setCalculationId(calculationId);
        response.setStatus("PENDING");
        response.setPrincipal(request.getPrincipal());
        response.setAnnualRate(request.getAnnualRate());
        response.setYears(request.getYears());
        response.setCompoundingFrequency(request.getCompoundingFrequency());
        response.setCreatedAt(createdAt);

        return response;
    }

    public CalculationResponse getCalculation(String calculationId) {
        return dynamoDbService.getCalculationResult(calculationId);
    }
}
