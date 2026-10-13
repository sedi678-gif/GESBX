// Shop Page
// Profile accessories, text colors, chat features and visual effects

import { PROFILE_ACCESSORIES } from './accessories';
import { TEXT_COLORS } from './text-colors';
import { CHAT_HISTORY_FEATURE, CHAT_MESSAGE_TYPES } from './chat-history';
import { VISUAL_EFFECTS } from './visual-effects';

const page = () => {
  const accessories = PROFILE_ACCESSORIES;
  const textColors = Object.values(TEXT_COLORS);
  const visualEffects = VISUAL_EFFECTS;
  
  return (
    <div className="shop-page">
      <header className="shop-header">
        <h1>🎁 Shop</h1>
        <p>Profile Customization & Features</p>
      </header>
      
      <section className="accessories-section">
        <h2>Profile Accessories</h2>
        <div className="accessories-grid">
          {accessories.map(accessory => (
            <div key={accessory.id} className="accessory-card">
              <div className="accessory-icon">{accessory.visualEffects[0]}</div>
              <div className="accessory-info">
                <h3>{accessory.name}</h3>
                <p>{accessory.description}</p>
                <p className="price">{accessor.price > 0 ? `${accessory.price}💎` : 'Free'}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      
      <section className="text-colors-section">
        <h2>Text Colors</h2>
        <div className="colors-grid">
          {textColors.map(color => (
            <div key={color.id} className="color-option">
              <div className="color-swatch" style={{color: color.hex}} />
              <span>{color.name}</span>
              <p className="price">{color.cosmetic ? (color.price > 0 ? `${color.price}💎` : 'Free') : 'N/A'}</p>
            </div>
          ))}
        </div>
      </section>
      
      <section className="visual-effects-section">
        <h2>Visual Effects</h2>
        <div className="effects-grid">
          {visualEffects.map(effect => (
            <div key={effect.id} className="effect-card">
              <div className="effect-preview" style={{background: effect.visualEffect}} />
              <div className="effect-info">
                <h3>{effect.name}</h3>
                <p>{effect.description}</p>
                <p className="price">{effect.price > 0 ? `${effect.price}💎` : 'Free'}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      
      <section className="chat-features-section">
        <h2>Chat Features</h2>
        <div className="chat-features">
          <div className="feature-item">
            <span>Message History</span>
            <p>View up to {CHAT_HISTORY_FEATURE.maxMessages} messages</p>
          </div>
          <div className="feature-item">
            <span>Search Messages</span>
            <p>Find specific conversations</p>
          </div>
          <div className="feature-item">
            <span>Timestamp Display</span>
            <p>{CHAT_HISTORY_FEATURE.displayOptions.showTimestamps ? 'Enabled' : 'Disabled'}</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default page;