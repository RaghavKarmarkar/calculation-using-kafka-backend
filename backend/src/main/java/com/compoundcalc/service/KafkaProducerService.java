package com.compoundcalc.service;

import com.compoundcalc.model.CalculationEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Service;

import java.util.concurrent.CompletableFuture;

@Service
public class KafkaProducerService {

    private static final Logger logger = LoggerFactory.getLogger(KafkaProducerService.class);

    private final KafkaTemplate<String, CalculationEvent> kafkaTemplate;

    @Value("${kafka.topic.calculation-requests:calculation-requests}")
    private String topic;

    public KafkaProducerService(KafkaTemplate<String, CalculationEvent> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    public void sendCalculationRequest(CalculationEvent event) {
        CompletableFuture<SendResult<String, CalculationEvent>> future =
                kafkaTemplate.send(topic, event.getCalculationId(), event);

        future.whenComplete((result, ex) -> {
            if (ex != null) {
                logger.error("Failed to send calculation event [{}]: {}", event.getCalculationId(), ex.getMessage());
            } else {
                logger.info("Calculation event [{}] sent to topic [{}] partition [{}] offset [{}]",
                        event.getCalculationId(),
                        result.getRecordMetadata().topic(),
                        result.getRecordMetadata().partition(),
                        result.getRecordMetadata().offset());
            }
        });
    }
}
