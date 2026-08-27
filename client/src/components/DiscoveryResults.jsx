import { Link } from "react-router-dom";
import RichText from "./RichText.jsx";

export default function DiscoveryResults({
  results,
  loading,
  error,
  onRetry,
  onSelectFlair
}) {
  if (loading) {
    return <p className="muted" role="status">Finding communities, people, and flairs...</p>;
  }

  if (error) {
    return (
      <p className="error-state" role="alert">
        Discovery results could not load.{" "}
        <button type="button" onClick={onRetry}>Retry</button>
      </p>
    );
  }

  const communities = results?.communities || [];
  const users = results?.users || [];
  const linkFlairs = results?.linkFlairs || [];
  if (communities.length === 0 && users.length === 0 && linkFlairs.length === 0) {
    return null;
  }

  return (
    <section className="search-discovery" aria-labelledby="discovery-heading">
      <h2 id="discovery-heading">Explore matches</h2>
      <div className="discovery-grid">
        {communities.length > 0 && (
          <section aria-labelledby="community-matches-heading">
            <h3 id="community-matches-heading">Communities</h3>
            <div className="discovery-list">
              {communities.map((community) => (
                <div key={community._id} className="discovery-result">
                  <Link className="inline-link strong" to={`/communities/${community._id}`}>
                    {community.name}
                  </Link>
                  <span className="row-card-subtitle">
                    {community.memberCount ?? 0} {community.memberCount === 1 ? "member" : "members"}
                  </span>
                  <RichText text={community.description} />
                </div>
              ))}
            </div>
          </section>
        )}

        {users.length > 0 && (
          <section aria-labelledby="people-matches-heading">
            <h3 id="people-matches-heading">People</h3>
            <div className="discovery-list">
              {users.map((person) => (
                <div key={person._id} className="discovery-result">
                  <Link className="inline-link strong" to={`/users/${person._id}`}>
                    {person.displayName}
                  </Link>
                  <span className="row-card-subtitle">
                    Reputation: {person.reputation ?? 0}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {linkFlairs.length > 0 && (
          <section aria-labelledby="flair-matches-heading">
            <h3 id="flair-matches-heading">Flairs</h3>
            <div className="discovery-flairs">
              {linkFlairs.map((flair) => (
                <button
                  key={flair._id}
                  type="button"
                  className="flair discovery-flair"
                  onClick={() => onSelectFlair(flair._id)}
                >
                  {flair.content}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </section>
  );
}
