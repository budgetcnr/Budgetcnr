// Preserve the existing public website while the tuition API is migrated.
// Database contents and authentication secrets must never be served as assets.
export default {
  fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
