# Namma Pattas — wala effects research and implementation

## Verified references

- Ravindra Fireworks manufacturer catalogue lists 100, 1,000 and 10,000 wala
  garlands: https://ravindrafireworkslimited.com/garland.php
- Narendra's manufacturer description identifies the 100 as one linked string
  producing rapid successive sharp bangs and continuous crackling:
  https://www.narendracrackers.com/shop/100-watts/
- A Kailas Fireworks seller photograph shows an unrolled asymmetric S with a
  braided central cord, red cylinders on both sides, uneven angles and fanning
  around bends: https://www.exportersindia.com/product-detail/garland-cracker-4340701.htm
  Direct photograph inspected:
  https://img500.exportersindia.com/product_images/bc-500/2018/9/4259199/garland-cracker-1537964318-4340701.jpeg
- Ravindra's 100 and 1,000 packaging artwork also shows the paired-sided cord:
  https://ravindrafireworkslimited.com/images/portfolios/ec10.jpg
  https://ravindrafireworkslimited.com/images/portfolios/ec13.jpg

The manufacturer demo index was reviewed, but its YouTube videos could not be
played here. No measured timing or frame-by-frame recoil claim is made:
https://www.manickanadarfireworks.com/fireworks-sivakasi-india-video.html
Ravindra's page labels ec15 as 10,000, but that picture says 5,000; it was excluded
as a verified 10,000 visual. Product pictures are research references only.

## Design choices

Keep the user's S shape and exact counts. Sample layout irregularities once at
placement so the object remains anchored. Vary bends, cylinder angle/size/shade,
longitudinal staggering and packet density. Compact layered 10,000 packets are
an artistic AR footprint choice, not a replica of a manufacturer's dimensions.

Replace narrow uniform time gaps and every-24th accents with deterministic runs,
brief hesitations and stochastic accents. Target roughly 5 / 12 / 30 seconds
including the initial fuse, with slight duration variation. This cadence is an
artistic interpretation of a linked crackling roll, not a recorded measurement.

A small 120ms region ahead of the burning tip receives local recoil through
instance attributes and a shared time uniform. CPU instance matrices never move
when the camera moves. Every body is still consumed. Flashes are short and local;
sparks vary in speed and lifetime. Torn paper spins and settles on the captured
floor. Smoke rises behind the advancing front and the cord chars before fading.

Mix short procedural sound buffers using the actual timeline offsets, varied
transients and tails. This preserves rhythm below display-frame duration without
creating one Web Audio graph per cracker. Rendering is bounded to 96 pops per
window, and visual samples and debris also use fixed budgets. Mute, backgrounding,
tracking pause and the independent palm audio context retain their prior behavior.

## Verification

67 automated tests passed. Actual application integration covers all eight
floor crackers on a hand, dropping, upright landing, effect continuity, hand
stabilization, Atom gating, bounded mixed effects and sound-node cleanup. New
checks cover all counts, seed repeatability and variation, irregular timelines,
30/60/120Hz completion, audio waveform bounds and shader transform order.
CPU geometry projections were visually inspected. The managed preview launcher
cannot start this Next project because it supplies Vite-only flags; browser GPU
rendering and listening were not verified. A physical Safari/Chrome session
remains necessary for final effect appearance, audio texture and AR performance.
