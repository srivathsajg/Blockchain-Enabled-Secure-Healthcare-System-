"""
app/nutrition/bmi.py
BMI calculation and status classification.
"""
from __future__ import annotations


def calculate_bmi(weight_kg: float, height_cm: float) -> float:
    """Body Mass Index = weight(kg) / height(m)^2"""
    if height_cm <= 0:
        raise ValueError("height_cm must be positive")
    height_m = height_cm / 100.0
    return round(weight_kg / (height_m ** 2), 2)


def bmi_status(bmi: float) -> str:
    """
    WHO BMI classification.
    Source: WHO Global Database on Body Mass Index.
    """
    if bmi < 18.5:
        return "Underweight"
    elif bmi < 25.0:
        return "Normal"
    elif bmi < 30.0:
        return "Overweight"
    else:
        return "Obese"
