/**
 * backend/modules/track/biomarker.evaluator.js
 * =========================================================================
 * CLINICAL BIOMARKER STATUS EVALUATOR (ADAPTER TO LAB STATUS ENGINE)
 *
 * Delegates directly to the simple labStatusEngine:
 *   extracted value + reference range -> calculateLabStatus -> LOW / HIGH / NORMAL
 */

"use strict";

const {
  calculateLabStatus,
  calculateThresholdStatus,
  parseOcrReferenceRange,
  isRangeUsable,
  evaluateComponent,
  evaluateLabComponents,
  normalizeLabUnit,
} = require("./labStatusEngine");
const { LAB_FALLBACK_REGISTRY, findFallbackRange } = require("../../config/labReferenceRanges");

/**
 * Adapter for evaluateBiomarkerStatus
 * Keeps both calculatedStatus ("LOW") and status ("low" / "LOW") for full compatibility
 */
function evaluateBiomarkerStatus(params) {
  if (!params) return null;
  const comp = evaluateComponent({
    testName: params.name || params.testName,
    value: params.value,
    unit: params.unit,
    referenceLow: params.referenceLow ?? params.referenceMin,
    referenceHigh: params.referenceHigh ?? params.referenceMax,
    referenceRule: params.referenceRule || params.referenceOperator,
    referenceThreshold: params.referenceThreshold,
    referenceText: params.referenceText,
    sourcePrintedStatus: params.sourcePrintedStatus,
  });

  return {
    ...comp,
    status: (comp.status || "").toLowerCase(), // backwards compatibility
    calculatedStatus: comp.status, // uppercase ("LOW", "HIGH", "NORMAL", "UNKNOWN")
  };
}

/**
 * Adapter for evaluateMedicalIndicators
 */
function evaluateMedicalIndicators(rawIndicators) {
  return evaluateLabComponents(rawIndicators);
}

module.exports = {
  calculateLabStatus,
  calculateThresholdStatus,
  parseOcrReferenceRange,
  isRangeUsable,
  evaluateComponent,
  evaluateLabComponents,
  evaluateBiomarkerStatus,
  evaluateMedicalIndicators,
  normalizeLabUnit,
  normalizeUnit: normalizeLabUnit,
  findFallbackRange,
  BIOMARKER_CATALOG: LAB_FALLBACK_REGISTRY,
  LAB_FALLBACK_REGISTRY,
};
