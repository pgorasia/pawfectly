import React, { useMemo, useState } from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { Card } from '@/components/ui/Card';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';

export type ConsumableUpsellOption = {
  quantity: number;
  totalPriceLabel: string; // e.g. "$3.99"
  subtitle?: string; // e.g. "≈ $3.33 each"
  popular?: boolean;
};

export function ConsumableUpsellModal({
  visible,
  title,
  message,
  options,
  confirmVerb = 'Get',
  unitLabel,
  defaultSelectedQuantity,
  onClose,
  onPurchase,
  secondaryCta,
}: {
  visible: boolean;
  title: string;
  message?: string;
  options: ConsumableUpsellOption[];
  confirmVerb?: string;
  unitLabel?: string; // e.g. "rewinds", "compliments", "resets"
  defaultSelectedQuantity?: number;
  onClose: () => void;
  onPurchase: (quantity: number) => Promise<void> | void;
  secondaryCta?: { label: string; onPress: () => void } | null;
}) {
  const initial =
    defaultSelectedQuantity ??
    options.find((o) => o.popular)?.quantity ??
    options[0]?.quantity ??
    1;
  const [selected, setSelected] = useState<number>(initial);

  const selectedOption = useMemo(
    () => options.find((o) => o.quantity === selected) ?? options[0]!,
    [options, selected]
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>
          <AppText variant="heading" style={styles.title}>
            {title}
          </AppText>
          {!!message && (
            <AppText variant="body" style={styles.message}>
              {message}
            </AppText>
          )}

          <View style={styles.tilesRow}>
            {options.map((o) => {
              const isSelected = o.quantity === selected;
              return (
                <View key={o.quantity} style={styles.tileWrap}>
                  {!!o.popular && (
                    <View style={styles.popularPill}>
                      <AppText variant="caption" style={styles.popularPillText}>
                        Most popular
                      </AppText>
                    </View>
                  )}
                  <TouchableOpacity
                    style={[styles.tile, isSelected && styles.tileSelected]}
                    onPress={() => setSelected(o.quantity)}
                    activeOpacity={0.85}
                  >
                    <AppText variant="heading" style={styles.tileQty}>
                      {o.quantity}
                    </AppText>
                    <AppText variant="caption" style={styles.tilePrice}>
                      {o.totalPriceLabel}
                    </AppText>
                    {!!o.subtitle && (
                      <AppText variant="caption" style={styles.tileSubtitle}>
                        {o.subtitle}
                      </AppText>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          <AppButton
            variant="primary"
            onPress={() => onPurchase(selectedOption.quantity)}
            style={styles.primaryCta}
          >
            {confirmVerb} {selectedOption.quantity}
            {unitLabel ? ` ${unitLabel}` : ''} for {selectedOption.totalPriceLabel}
          </AppButton>

          {!!secondaryCta && (
            <AppButton variant="secondary" onPress={secondaryCta.onPress} style={styles.secondaryCta}>
              {secondaryCta.label}
            </AppButton>
          )}

          <Card style={styles.finePrintCard}>
            <AppText variant="caption" style={styles.finePrint}>
              Purchases are currently stubbed: we’ll assume success until billing is wired.
            </AppText>
          </Card>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
    padding: Spacing.lg,
  },
  sheet: {
    backgroundColor: Colors.background,
    borderRadius: 20,
    padding: Spacing.lg,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  message: {
    opacity: 0.75,
    marginBottom: Spacing.lg,
  },
  tilesRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  tileWrap: {
    flex: 1,
    alignItems: 'center',
  },
  popularPill: {
    marginBottom: -10,
    zIndex: 2,
    backgroundColor: Colors.primary,
    borderRadius: 999,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  popularPillText: {
    color: Colors.background,
    fontWeight: '800',
    fontSize: 10,
  },
  tile: {
    width: '100%',
    backgroundColor: 'rgba(31, 41, 55, 0.05)',
    borderRadius: 16,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    minHeight: 110,
    justifyContent: 'center',
    gap: 4,
  },
  tileSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },
  tileQty: {
    fontWeight: '900',
  },
  tilePrice: {
    fontWeight: '800',
    opacity: 0.8,
  },
  tileSubtitle: {
    opacity: 0.65,
    textAlign: 'center',
  },
  primaryCta: {
    width: '100%',
  },
  secondaryCta: {
    width: '100%',
    marginTop: Spacing.sm,
  },
  finePrintCard: {
    marginTop: Spacing.md,
    backgroundColor: 'rgba(31, 41, 55, 0.04)',
  },
  finePrint: {
    opacity: 0.7,
  },
});

