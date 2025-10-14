interface ProductBadgeProps {
  type: 'discount' | 'new' | 'included' | 'popular';
  text: string;
}

export function ProductBadge({ type, text }: ProductBadgeProps) {
  const getStyles = () => {
    switch (type) {
      case 'discount':
        return 'bg-[#FF7A29] text-white border-2 border-[#2D2D2D]';
      case 'new':
        return 'bg-[#F7C948] text-[#2D2D2D] border-2 border-[#2D2D2D]';
      case 'included':
        return 'bg-[#FF7A29] text-white border-2 border-[#2D2D2D]';
      case 'popular':
        return 'bg-[#2D2D2D] text-white border-2 border-[#2D2D2D]';
      default:
        return 'bg-[#2D2D2D] text-white border-2 border-[#2D2D2D]';
    }
  };

  return (
    <div
      className={`px-4 py-2 rounded-full text-[13px] uppercase tracking-wide inline-block ${getStyles()}`}
      style={{ fontWeight: 700 }}
    >
      {text}
    </div>
  );
}
