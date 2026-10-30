import { useState } from 'react';
import { ArrowUpRight, Play } from 'lucide-react';
import './instagram-reels.css';

// Manually curated Reels; this is not an automatically synchronized feed.
const reels = [{ id: 'De6i5sANeIt', title: 'TREASURE on Instagram' }];

export default function InstagramReels() {
  const [loadedReels, setLoadedReels] = useState<string[]>([]);
  return (
    <section className="section instagram-section" id="instagram" aria-labelledby="instagram-title">
      <div className="section-inner instagram-layout">
        <div className="instagram-copy">
          <div className="section-label">05 / From Instagram</div>
          <h2 id="instagram-title">See TREASURE<br /><em>in motion.</em></h2>
          <p>Watch selected Reels from @treasure_polinema and follow our Instagram for more event updates.</p>
          <a className="button button-light" href="https://www.instagram.com/treasure_polinema/" target="_blank" rel="noopener noreferrer">
            Follow @treasure_polinema <ArrowUpRight size={15} aria-hidden="true" />
          </a>
          <p className="instagram-note">Select “Load Reel” to connect to Instagram and load its embedded player. If a video does not load or asks you to sign in, use “Watch on Instagram” to open it directly.</p>
        </div>
        <div className="instagram-reels">
          {reels.map((reel) => (
            <article className="instagram-reel" key={reel.id}>
              {loadedReels.includes(reel.id) ? <iframe
                src={`https://www.instagram.com/reel/${reel.id}/embed/`}
                title={`${reel.title} — @treasure_polinema`}
                allow="encrypted-media; fullscreen; picture-in-picture"
                referrerPolicy="strict-origin-when-cross-origin"
              /> : <div className="instagram-placeholder">
                <span className="section-label">Instagram Reel</span>
                <Play size={42} aria-hidden="true" />
                <h3>{reel.title}</h3>
                <p>@treasure_polinema</p>
                <button className="button button-light" type="button" onClick={() => setLoadedReels((ids) => [...ids, reel.id])} data-testid={`button-load-instagram-${reel.id}`}>
                  Load Reel
                </button>
                <small>Instagram content loads only when you choose to view it.</small>
              </div>}
              <a className="instagram-watch" href={`https://www.instagram.com/reel/${reel.id}/`} target="_blank" rel="noopener noreferrer" data-testid={`link-instagram-reel-${reel.id}`}>
                Watch on Instagram <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
