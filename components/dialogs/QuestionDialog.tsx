/**
 * QuestionDialog component for handling AI question requests.
 * Displays questions from the AI agent and allows user to select answers.
 */

import React, { useState, useCallback, useEffect } from 'react'
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Platform,
} from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import Animated, {
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated'

import { Colors, Spacing, BorderRadius, FontSize, FontFamily } from '@/constants/Theme'
import type { QuestionRequest, QuestionInfo, QuestionOption } from '@/types'

interface QuestionBannerProps {
  question: QuestionRequest
  answers: (string[] | null)[]
  onAnswerChange: (questionIndex: number, selectedLabels: string[]) => void
  onSubmit: () => void
  onReject: () => void
}

/**
 * Inline question request banner.
 * Displays at the bottom of the chat with slide-in animation.
 * Supports single and multi-select questions, plus custom "Other" input.
 */
export function QuestionBanner({
  question,
  answers,
  onAnswerChange,
  onSubmit,
  onReject,
}: QuestionBannerProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [customInputs, setCustomInputs] = useState<Record<number, string>>({})
  
  const currentQuestion = question.questions[currentQuestionIndex]
  const totalQuestions = question.questions.length
  const hasMultipleQuestions = totalQuestions > 1

  // Trigger haptic feedback when banner appears
  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  }, [])

  const handleOptionSelect = useCallback((option: QuestionOption) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    
    const currentAnswers = answers[currentQuestionIndex] || []
    const isSelected = currentAnswers.includes(option.label)
    
    if (currentQuestion.multiple) {
      // Multi-select: toggle the option
      if (isSelected) {
        onAnswerChange(
          currentQuestionIndex,
          currentAnswers.filter((l) => l !== option.label)
        )
      } else {
        onAnswerChange(currentQuestionIndex, [...currentAnswers, option.label])
      }
    } else {
      // Single-select: replace
      if (isSelected) {
        onAnswerChange(currentQuestionIndex, [])
      } else {
        onAnswerChange(currentQuestionIndex, [option.label])
      }
    }
  }, [answers, currentQuestionIndex, currentQuestion.multiple, onAnswerChange])

  const handleCustomInput = useCallback((text: string) => {
    setCustomInputs((prev) => ({ ...prev, [currentQuestionIndex]: text }))
  }, [currentQuestionIndex])

  const handleAddCustomAnswer = useCallback(() => {
    const customText = customInputs[currentQuestionIndex]?.trim()
    if (!customText) return
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    
    const currentAnswers = answers[currentQuestionIndex] || []
    if (!currentAnswers.includes(customText)) {
      if (currentQuestion.multiple) {
        onAnswerChange(currentQuestionIndex, [...currentAnswers, customText])
      } else {
        onAnswerChange(currentQuestionIndex, [customText])
      }
    }
    setCustomInputs((prev) => ({ ...prev, [currentQuestionIndex]: '' }))
  }, [customInputs, currentQuestionIndex, answers, currentQuestion.multiple, onAnswerChange])

  const handlePrevious = useCallback(() => {
    if (currentQuestionIndex > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      setCurrentQuestionIndex(currentQuestionIndex - 1)
    }
  }, [currentQuestionIndex])

  const handleNext = useCallback(() => {
    if (currentQuestionIndex < totalQuestions - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      setCurrentQuestionIndex(currentQuestionIndex + 1)
    }
  }, [currentQuestionIndex, totalQuestions])

  const handleSubmit = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    onSubmit()
  }, [onSubmit])

  const handleReject = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onReject()
  }, [onReject])

  const currentAnswers = answers[currentQuestionIndex] || []
  const canSubmit = answers.some((a) => a && a.length > 0)

  return (
    <Animated.View
      entering={SlideInDown.springify().damping(18).stiffness(140)}
      exiting={SlideOutDown.springify().damping(18).stiffness(140)}
      style={styles.banner}
    >
      {/* Header with icon and question navigation */}
      <View style={styles.bannerHeader}>
        <View style={styles.bannerIconContainer}>
          <MaterialCommunityIcons
            name="help-circle-outline"
            size={20}
            color={Colors.primary}
          />
        </View>
        <View style={styles.bannerContent}>
          <View style={styles.bannerTitleRow}>
            <Text style={styles.bannerLabel}>Question</Text>
            {hasMultipleQuestions && (
              <Text style={styles.bannerProgress}>
                {currentQuestionIndex + 1}/{totalQuestions}
              </Text>
            )}
          </View>
          <Text style={styles.bannerHeader} numberOfLines={1}>
            {currentQuestion.header}
          </Text>
        </View>
      </View>

      {/* Question text */}
      <Text style={styles.questionText}>
        {currentQuestion.question}
      </Text>

      {/* Options */}
      <ScrollView
        style={styles.optionsContainer}
        contentContainerStyle={styles.optionsContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {currentQuestion.options.map((option, index) => {
          const isSelected = currentAnswers.includes(option.label)
          return (
            <Pressable
              key={`${currentQuestionIndex}-${index}`}
              style={({ pressed }) => [
                styles.optionButton,
                isSelected && styles.optionButtonSelected,
                pressed && styles.optionButtonPressed,
              ]}
              onPress={() => handleOptionSelect(option)}
            >
              <View style={styles.optionCheckbox}>
                {currentQuestion.multiple ? (
                  <MaterialCommunityIcons
                    name={isSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    size={20}
                    color={isSelected ? Colors.primary : Colors.textSecondary}
                  />
                ) : (
                  <MaterialCommunityIcons
                    name={isSelected ? 'radiobox-marked' : 'radiobox-blank'}
                    size={20}
                    color={isSelected ? Colors.primary : Colors.textSecondary}
                  />
                )}
              </View>
              <View style={styles.optionTextContainer}>
                <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                  {option.label}
                </Text>
                {option.description && (
                  <Text style={styles.optionDescription} numberOfLines={2}>
                    {option.description}
                  </Text>
                )}
              </View>
            </Pressable>
          )
        })}

        {/* Custom "Other" input */}
        <View style={styles.customInputContainer}>
          <TextInput
            style={styles.customInput}
            placeholder="Other (type custom answer)"
            placeholderTextColor={Colors.textMuted}
            value={customInputs[currentQuestionIndex] || ''}
            onChangeText={handleCustomInput}
            onSubmitEditing={handleAddCustomAnswer}
            returnKeyType="done"
          />
          {customInputs[currentQuestionIndex]?.trim() && (
            <Pressable
              style={styles.addCustomButton}
              onPress={handleAddCustomAnswer}
            >
              <MaterialCommunityIcons
                name="plus-circle"
                size={24}
                color={Colors.primary}
              />
            </Pressable>
          )}
        </View>

        {/* Show custom answers that were added */}
        {currentAnswers
          .filter((a) => !currentQuestion.options.some((o) => o.label === a))
          .map((customAnswer, index) => (
            <View key={`custom-${index}`} style={[styles.optionButton, styles.optionButtonSelected]}>
              <View style={styles.optionCheckbox}>
                <MaterialCommunityIcons
                  name={currentQuestion.multiple ? 'checkbox-marked' : 'radiobox-marked'}
                  size={20}
                  color={Colors.primary}
                />
              </View>
              <View style={styles.optionTextContainer}>
                <Text style={[styles.optionLabel, styles.optionLabelSelected]}>
                  {customAnswer}
                </Text>
                <Text style={styles.optionDescription}>Custom answer</Text>
              </View>
              <Pressable
                onPress={() => {
                  const filtered = currentAnswers.filter((a) => a !== customAnswer)
                  onAnswerChange(currentQuestionIndex, filtered)
                }}
              >
                <MaterialCommunityIcons
                  name="close-circle"
                  size={20}
                  color={Colors.textSecondary}
                />
              </Pressable>
            </View>
          ))}
      </ScrollView>

      {/* Navigation for multiple questions */}
      {hasMultipleQuestions && (
        <View style={styles.navigationRow}>
          <Pressable
            style={[styles.navButton, currentQuestionIndex === 0 && styles.navButtonDisabled]}
            onPress={handlePrevious}
            disabled={currentQuestionIndex === 0}
          >
            <MaterialCommunityIcons
              name="chevron-left"
              size={20}
              color={currentQuestionIndex === 0 ? Colors.textMuted : Colors.text}
            />
            <Text style={[styles.navButtonText, currentQuestionIndex === 0 && styles.navButtonTextDisabled]}>
              Previous
            </Text>
          </Pressable>
          <Pressable
            style={[styles.navButton, currentQuestionIndex === totalQuestions - 1 && styles.navButtonDisabled]}
            onPress={handleNext}
            disabled={currentQuestionIndex === totalQuestions - 1}
          >
            <Text style={[styles.navButtonText, currentQuestionIndex === totalQuestions - 1 && styles.navButtonTextDisabled]}>
              Next
            </Text>
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color={currentQuestionIndex === totalQuestions - 1 ? Colors.textMuted : Colors.text}
            />
          </Pressable>
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.bannerActions}>
        <Pressable
          style={({ pressed }) => [
            styles.bannerButton,
            styles.bannerRejectButton,
            pressed && styles.bannerButtonPressed,
          ]}
          onPress={handleReject}
        >
          <MaterialCommunityIcons
            name="close"
            size={16}
            color={Colors.textSecondary}
          />
          <Text style={styles.bannerRejectText}>Dismiss</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.bannerButton,
            styles.bannerSubmitButton,
            !canSubmit && styles.bannerButtonDisabled,
            pressed && canSubmit && styles.bannerButtonPressed,
          ]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          <MaterialCommunityIcons
            name="check"
            size={16}
            color={canSubmit ? Colors.textInverse : Colors.textMuted}
          />
          <Text style={[styles.bannerSubmitText, !canSubmit && styles.bannerSubmitTextDisabled]}>
            Submit{hasMultipleQuestions ? ' All' : ''}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  // Banner styles
  banner: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    maxHeight: 400,
    ...Platform.select({
      ios: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  bannerHeader: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  bannerIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${Colors.primary}20`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerContent: {
    flex: 1,
    justifyContent: 'center',
  },
  bannerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bannerProgress: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
  },

  // Question text
  questionText: {
    fontSize: FontSize.md,
    color: Colors.text,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },

  // Options
  optionsContainer: {
    maxHeight: 180,
  },
  optionsContent: {
    gap: Spacing.xs,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.sm,
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: Spacing.sm,
  },
  optionButtonSelected: {
    backgroundColor: `${Colors.primary}15`,
    borderColor: Colors.primary,
  },
  optionButtonPressed: {
    opacity: 0.7,
  },
  optionCheckbox: {
    paddingTop: 2,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionLabel: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    color: Colors.text,
  },
  optionLabelSelected: {
    color: Colors.primary,
  },
  optionDescription: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // Custom input
  customInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  customInput: {
    flex: 1,
    height: 40,
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.sm,
    color: Colors.text,
    fontFamily: FontFamily.system,
  },
  addCustomButton: {
    padding: Spacing.xs,
  },

  // Navigation
  navigationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    padding: Spacing.xs,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navButtonText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    color: Colors.text,
  },
  navButtonTextDisabled: {
    color: Colors.textMuted,
  },

  // Actions
  bannerActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  bannerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  bannerButtonPressed: {
    opacity: 0.7,
  },
  bannerButtonDisabled: {
    opacity: 0.5,
  },
  bannerRejectButton: {
    backgroundColor: Colors.backgroundTertiary,
  },
  bannerSubmitButton: {
    backgroundColor: Colors.primary,
  },
  bannerRejectText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  bannerSubmitText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textInverse,
  },
  bannerSubmitTextDisabled: {
    color: Colors.textMuted,
  },
})
