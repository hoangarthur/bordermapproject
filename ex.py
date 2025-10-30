import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import plotly.express as px
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

# Load CSV
df = pd.read_csv('history.csv')

# Parse Date to datetime (e.g., 'Jan 2024' -> 2024-01-01)
df['Date'] = pd.to_datetime(df['Date'], format='%b %Y')

# Extract Year and Month for grouping
df['Year'] = df['Date'].dt.year
df['Month'] = df['Date'].dt.month_name()

# Convert Value to numeric (assuming it's integer)
df['Value'] = pd.to_numeric(df['Value'], errors='coerce')

# Filter to relevant data (e.g., post-2000 for 9/11/pandemic context; adjust as needed)
df = df[df['Year'] >= 1996].dropna(subset=['Value'])

print(df.head())  # Quick check

# Aggregate total crossings by year
yearly_total = df.groupby('Year')['Value'].sum().reset_index()

# Interactive Visual 1: Time-Series with Slider (Slide years), Drag-to-Zoom/Pan, Click Points
fig1 = go.Figure()

# Line plot
fig1.add_trace(go.Scatter(x=yearly_total['Year'], y=yearly_total['Value'],
                          mode='lines+markers', name='Total Crossings',
                          line=dict(color='blue', width=2), marker=dict(size=8)))

# Event lines
fig1.add_vline(x=2001, line_dash="dash", line_color="red", annotation_text="9/11")
fig1.add_vline(x=2020, line_dash="dash", line_color="orange", annotation_text="2020 Pandemic")
fig1.add_vline(x=2008, line_dash="dash", line_color="brown", annotation_text="2008 Great Recession")

# Add slider for year filtering (slide to zoom/filter range)
steps = []
for i in range(len(yearly_total['Year'])):
    step = dict(
        method="restyle",
        args=[{"x": [yearly_total['Year'][:i+1]], "y": [yearly_total['Value'][:i+1]]}],
        label=str(yearly_total['Year'][i])
    )
    steps.append(step)

sliders = [dict(
    active= len(yearly_total)-1,
    currentvalue={"prefix": "Year: "},
    pad={"t": 50},
    steps=steps
)]

fig1.update_layout(
    title='Total Border Crossings by Year (Slide Slider, Drag Zoom, Click Points)',
    xaxis_title='Year', yaxis_title='Total Crossings',
    sliders=sliders,
    hovermode='x unified',
    dragmode='pan',  # Enable drag-to-pan
    template='plotly_white'
)

# Click callback (in Jupyter/Dash; prints to console here)
fig1.update_layout(clickmode='event+select')

fig1.show()  # Interactive in Jupyter/browser

# Aggregate total traffic by port
port_total = df.groupby('Port Name')['Value'].sum().sort_values(ascending=False).head(10).reset_index()

# Interactive Visual 2: Bar Chart with Click Selection (Click to Highlight/Filter)
fig2 = px.bar(port_total, y='Port Name', x='Value', orientation='h',
              title='Top 10 Ports of Entry by Total Traffic (Click Bars to Select)',
              color='Value', color_continuous_scale='viridis')

fig2.update_layout(
    yaxis={'categoryorder':'total ascending'},
    dragmode='pan'  # Drag to pan
)

# Click callback example (console log)
fig2.update_layout(clickmode='event+select')

fig2.show()

# Aggregate average value by Measure and Month
monthly_measure = df.groupby(['Measure', 'Month'])['Value'].mean().unstack(fill_value=0)

# Interactive Visual 3: Heatmap with Zoom/Click (Drag to Select Cells)
fig3 = px.imshow(monthly_measure, labels=dict(x="Month", y="Measure", color="Avg Crossings"),
                 title='Peak Months for Each Transportation Measure (Drag to Zoom, Click Cells)',
                 aspect="auto", color_continuous_scale='YlOrRd')

fig3.update_layout(
    dragmode='zoom'  # Drag to zoom on cells
)

# Click callback (console log for selected measure/month)
fig3.update_layout(clickmode='event+select')

fig3.show()