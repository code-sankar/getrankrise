/**
 * StarRating Component
 * @param {number} rating - The numerical rating (1-5)
 * @param {string} size - 'sm', 'md', or 'lg' for flexible UI placement
 */
export default function StarRating({ rating, size = "sm" }) {
  // Define dimensions based on size prop
  const sizes = {
    sm: "w-3.5 h-3.5",
    md: "w-5 h-5",
    lg: "w-6 h-6",
  };

  const iconSize = sizes[size] || sizes.sm;

  return (
    <div className="flex items-center gap-0.5" aria-label={`Rating: ${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const isFilled = star <= Math.round(rating);

        return (
          <svg
            key={star}
            className={`${iconSize} transition-colors duration-200 ${
              isFilled ? "text-amber-400" : "text-slate-300 dark:text-slate-700"
            }`}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z"
              clipRule="evenodd"
            />
          </svg>
        );
      })}
      
      {/* Optional: Add numerical value if size is large */}
      {size === "lg" && (
        <span className="ml-2 text-lg font-bold text-slate-900 dark:text-white">
          {rating}
        </span>
      )}
    </div>
  );
}