import { Component } from "react";

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="fatal-screen">
        <section className="fatal-panel" role="alert">
          <p className="bootstrap-brand">phreddit</p>
          <h1>Something went wrong</h1>
          <p>
            The interface hit an unexpected error. Reload the app to return to a clean state.
          </p>
          <a className="button-link" href="/home">Reload Phreddit</a>
        </section>
      </main>
    );
  }
}

