/**
 * Represents a watchdog timer that triggers a callback function when a timeout occurs.
 */
class Watchdog {
  /**
   * Creates a new instance of the Watchdog class.
   * @param {number} timeout - The timeout duration in milliseconds.
   * @param {Function} onTimeout - The callback function to be executed when the timeout occurs.
   */
  constructor(timeout, onTimeout) {
    this.watchdog = null;
    this.timeout = timeout;
    this.onTimeout = onTimeout;
  }

  /**
   * Starts the watchdog timer.
   */
  start() {
    this.watchdog = setTimeout(() => {
      this.onTimeout();
    }, this.timeout);
  }

  /**
   * Stops the watchdog timer.
   */
  stop() {
    clearInterval(this.watchdog);
  }
}

module.exports = Watchdog;