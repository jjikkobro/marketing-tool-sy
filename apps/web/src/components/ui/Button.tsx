import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/*
 * 버튼은 "동그라미" 요소라 pill 형태(rounded-full)를 쓴다.
 * primary는 오렌지가 아니라 차콜이다. 흰 글자와의 대비 때문이고,
 * 오렌지는 화면에서 강조할 한 곳에만 쓰기 위해서다.
 */
const variantClass: Record<Variant, string> = {
  primary: 'bg-charcoal text-white hover:bg-black',
  secondary: 'border border-ink-300 bg-white text-charcoal hover:border-charcoal',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-charcoal',
};

const sizeClass: Record<Size, string> = {
  sm: 'h-8 px-3.5 text-xs',
  md: 'h-10 px-5 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...props}
    />
  );
}
