#!/bin/sh
# Start Redis in background, then launch RSSHub

# Create Redis data directory in persistent storage
mkdir -p /data/redis

# Start Redis with custom data directory (uses HF Spaces storage bucket)
redis-server --dir /data --daemonize yes --save 60 1000 --stop-writes-on-bgsave-error no

# Start RSSHub via dumb-init
exec dumb-init -- npm run start
