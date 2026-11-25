import React from 'react';
import type { Session } from '../../types';

interface Props {
  session: Session;
}

export const InterviewReview: React.FC<Props> = ({ session }) => {
  const qa = session.interviewQa;
  if (!qa?.length) return null;

  return (
    <section className="result-coaching">
      <div className="result-section-title">
        <span>Interview Q&amp;A</span>
      </div>
      <div className="qa-review">
        {qa.map((item, index) => (
          <article key={`${index}-${item.question}`}>
            <div className="qa-meta">
              <span className={`verdict-badge verdict-${item.verdict}`}>{item.verdict}</span>
              <strong>{item.score.toFixed(1)} / 10</strong>
            </div>
            <p className="qa-question">{index + 1}. {item.question}</p>
            <p className="qa-answer"><strong>Your answer:</strong> {item.answer}</p>
            <p className="qa-feedback"><strong>Coach:</strong> {item.feedback}</p>
            <div className="qa-model"><strong>Strong answer:</strong> {item.modelAnswer}</div>
            {!!item.sources?.length && (
              <div className="qa-sources">
                {item.sources.map((source) => (
                  <a key={source.uri} href={source.uri} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
};
