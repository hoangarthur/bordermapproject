# import pandas as pd
# import plotly.graph_objects as go
# from plotly.subplots import make_subplots
# import plotly.express as px
# from datetime import datetime
# import warnings
# warnings.filterwarnings('ignore')

# # Load CSV
# df = pd.read_csv('history.csv')

# # Parse Date to datetime (e.g., 'Jan 2024' -> 2024-01-01)
# df['Date'] = pd.to_datetime(df['Date'], format='%b %Y')

# # Extract Year and Month for grouping
# df['Year'] = df['Date'].dt.year
# df['Month'] = df['Date'].dt.month_name()

# # Convert Value to numeric (assuming it's integer)
# df['Value'] = pd.to_numeric(df['Value'], errors='coerce')

# # Filter to relevant data (e.g., post-2000 for 9/11/pandemic context; adjust as needed)
# df = df[df['Year'] >= 1996].dropna(subset=['Value'])

# print(df.head())  # Quick check

# # Aggregate total crossings by year
# yearly_total = df.groupby('Year')['Value'].sum().reset_index()

# # Interactive Visual 1: Time-Series with Slider (Slide years), Drag-to-Zoom/Pan, Click Points
# fig1 = go.Figure()

# # Line plot
# fig1.add_trace(go.Scatter(x=yearly_total['Year'], y=yearly_total['Value'],
#                           mode='lines+markers', name='Total Crossings',
#                           line=dict(color='blue', width=2), marker=dict(size=8)))

# # Event lines
# fig1.add_vline(x=2001, line_dash="dash", line_color="red", annotation_text="9/11")
# fig1.add_vline(x=2020, line_dash="dash", line_color="orange", annotation_text="2020 Pandemic")
# fig1.add_vline(x=2008, line_dash="dash", line_color="brown", annotation_text="2008 Great Recession")

# # Add slider for year filtering (slide to zoom/filter range)
# steps = []
# for i in range(len(yearly_total['Year'])):
#     step = dict(
#         method="restyle",
#         args=[{"x": [yearly_total['Year'][:i+1]], "y": [yearly_total['Value'][:i+1]]}],
#         label=str(yearly_total['Year'][i])
#     )
#     steps.append(step)

# sliders = [dict(
#     active= len(yearly_total)-1,
#     currentvalue={"prefix": "Year: "},
#     pad={"t": 50},
#     steps=steps
# )]

# fig1.update_layout(
#     title='Total Border Crossings by Year (Slide Slider, Drag Zoom, Click Points)',
#     xaxis_title='Year', yaxis_title='Total Crossings',
#     sliders=sliders,
#     hovermode='x unified',
#     dragmode='pan',  # Enable drag-to-pan
#     template='plotly_white'
# )

# # Click callback (in Jupyter/Dash; prints to console here)
# fig1.update_layout(clickmode='event+select')

# fig1.show()  # Interactive in Jupyter/browser

# # Aggregate total traffic by port
# port_total = df.groupby('Port Name')['Value'].sum().sort_values(ascending=False).head(10).reset_index()

# # Interactive Visual 2: Bar Chart with Click Selection (Click to Highlight/Filter)
# fig2 = px.bar(port_total, y='Port Name', x='Value', orientation='h',
#               title='Top 10 Ports of Entry by Total Traffic (Click Bars to Select)',
#               color='Value', color_continuous_scale='viridis')

# fig2.update_layout(
#     yaxis={'categoryorder':'total ascending'},
#     dragmode='pan'  # Drag to pan
# )

# # Click callback example (console log)
# fig2.update_layout(clickmode='event+select')

# fig2.show()

# # Aggregate average value by Measure and Month
# monthly_measure = df.groupby(['Measure', 'Month'])['Value'].mean().unstack(fill_value=0)

# # Interactive Visual 3: Heatmap with Zoom/Click (Drag to Select Cells)
# fig3 = px.imshow(monthly_measure, labels=dict(x="Month", y="Measure", color="Avg Crossings"),
#                  title='Peak Months for Each Transportation Measure (Drag to Zoom, Click Cells)',
#                  aspect="auto", color_continuous_scale='YlOrRd')

# fig3.update_layout(
#     dragmode='zoom'  # Drag to zoom on cells
# )

# # Click callback (console log for selected measure/month)
# fig3.update_layout(clickmode='event+select')

# fig3.show()



# all in one visual example for reference

import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

from dash import Dash, dcc, html, Input, Output, callback
from calendar import month_name

# Load and preprocess data
df = pd.read_csv('history.csv')
df['Date'] = pd.to_datetime(df['Date'], format='%b %Y')
df['Year'] = df['Date'].dt.year
df['Month'] = df['Date'].dt.month_name()
df['Month'] = pd.Categorical(df['Month'], categories=list(month_name)[1:], ordered=True)
df['Value'] = pd.to_numeric(df['Value'], errors='coerce')
df = df[df['Year'] >= 1996].dropna(subset=['Value'])

# Pre-aggregates
yearly_total = df.groupby('Year')['Value'].sum().reset_index()
port_total = df.groupby('Port Name')['Value'].sum().sort_values(ascending=False).head(10).reset_index()
monthly_measure = df.groupby(['Measure', 'Month'])['Value'].mean().unstack(fill_value=0)

# Dash app
app = Dash(__name__)

app.layout = html.Div([
    html.H1("Border Crossings Dashboard", style={'textAlign': 'center', 'color': 'blue'}),
    html.P("Q1: Trends/Spikes | Q2: Top Ports | Q3: Monthly Peaks", style={'textAlign': 'center'}),

    html.Div([
        html.Div([
            html.Label("Select Year"),
            dcc.Slider(id='year-slider', min=yearly_total['Year'].min(), max=yearly_total['Year'].max(),
                       value=yearly_total['Year'].max(),
                       marks={y: str(y) for y in yearly_total['Year'][::2]}, step=1),
        ], style={'marginBottom': '20px'}),

        html.Div([
            html.Label("Select Port"),
            dcc.Dropdown(id='port-dropdown',
                         options=[{'label': p, 'value': p} for p in port_total['Port Name']],
                         value=None, placeholder="Select Port to Filter"),
        ], style={'marginBottom': '20px'}),

        html.Div([
            html.Label("Select Measure"),
            dcc.Dropdown(id='measure-dropdown',
                         options=[{'label': m, 'value': m} for m in monthly_measure.index],
                         value=None, placeholder="Select Measure to Filter Heatmap"),
        ]),
    ], style={'maxWidth': '800px', 'margin': 'auto'}),

    dcc.Graph(id='combined-dashboard', style={'width': '95%', 'margin': 'auto'}),
], style={'margin': '20px'})

@callback(
    Output('combined-dashboard', 'figure'),
    [Input('year-slider', 'value'), Input('port-dropdown', 'value'), Input('measure-dropdown', 'value')]
)
def update_dashboard(selected_year, selected_port, selected_measure):
    fig = make_subplots(
        rows=3, cols=1,
        subplot_titles=('Q1: Yearly Trends (Spikes/Drops)', 'Q2: Top Ports by Traffic', 'Q3: Peak Months by Measure'),
        vertical_spacing=0.1,
        row_heights=[0.4, 0.3, 0.3]
    )

    # Q1: Line chart
    if selected_port:
        port_data = df[df['Port Name'] == selected_port].groupby('Year')['Value'].sum().reset_index()
        filtered_yearly = pd.merge(yearly_total, port_data, on='Year', how='left').fillna(0)
        filtered_yearly = filtered_yearly[filtered_yearly['Year'] <= selected_year]
        y_values = filtered_yearly['Value_y']
    else:
        filtered_yearly = yearly_total[yearly_total['Year'] <= selected_year]
        y_values = filtered_yearly['Value']

    fig.add_trace(go.Scatter(
        x=filtered_yearly['Year'], y=y_values,
        mode='lines+markers', name='Total Crossings',
        line=dict(color='#1f77b4'), marker=dict(size=8)
    ), row=1, col=1)

    # Add event lines with annotations
    fig.add_vline(x=2001, line_dash="dash", line_color="#d62728", annotation_text="9/11", row=1, col=1)
    fig.add_vline(x=2020, line_dash="dash", line_color="#ff7f0e", annotation_text="COVID-19", row=1, col=1)
    fig.add_vline(x=2008, line_dash="dash", line_color="#9467bd", annotation_text="Recession", row=1, col=1)

    # Q2: Bar chart with gradient color and no legend
    if selected_year:
        year_data = df[df['Year'] <= selected_year].groupby('Port Name')['Value'].sum().sort_values(ascending=False).head(10).reset_index()
        filtered_ports = year_data
    else:
        filtered_ports = port_total

    fig.add_trace(go.Bar(
    y=filtered_ports['Port Name'],
    x=filtered_ports['Value'],
    orientation='h',
    showlegend=False,
    hoverinfo='x+y+z',
    marker=dict(
        color=filtered_ports['Value'],
        colorscale='Teal',
        coloraxis='coloraxis2'
    )), row=2, col=1)


    # Q3: Heatmap
    filtered_monthly = monthly_measure.copy()
    if selected_measure:
        filtered_monthly = filtered_monthly.loc[[selected_measure]]
    if selected_port:
        port_monthly = df[df['Port Name'] == selected_port].groupby(['Measure', 'Month'])['Value'].mean().unstack(fill_value=0)
        if selected_measure and selected_measure in port_monthly.index:
            filtered_monthly = port_monthly.loc[[selected_measure]]
        elif not selected_measure:
            filtered_monthly = port_monthly
    if selected_year:
        year_filtered = df[df['Year'] <= selected_year].groupby(['Measure', 'Month'])['Value'].mean().unstack(fill_value=0)
        if selected_measure:
            filtered_monthly = year_filtered.loc[[selected_measure]]
        elif not selected_port:
            filtered_monthly = year_filtered

    fig.add_trace(go.Heatmap(
        z=filtered_monthly.values,
        x=filtered_monthly.columns,
        y=filtered_monthly.index,
        colorscale='YlGnBu',
        coloraxis='coloraxis3',
        hoverinfo='x+y+z',
    ), row=3, col=1)

    fig.update_layout(
        coloraxis2=dict(
            colorbar=dict(title="Traffic Volume", len=0.25, y=0.5)
        ),
        coloraxis3=dict(
            colorbar=dict(title="Avg Value", len=0.3, y=0.15)
        ),
        height=950,
        showlegend=True,
        title_text="Dashboard",
        dragmode='pan',
        template='plotly_white',
        font=dict(family="Arial", size=12),
        margin=dict(t=80, b=40, l=60, r=40)
    )

    fig.update_xaxes(title_text="Year", row=1, col=1)
    fig.update_yaxes(title_text="Total Crossings", row=1, col=1)
    fig.update_xaxes(title_text="Traffic Volume", row=2, col=1)
    fig.update_yaxes(title_text="Port Name", row=2, col=1)
    fig.update_xaxes(title_text="Month", row=3, col=1)
    fig.update_yaxes(title_text="Measure", row=3, col=1)

    return fig

if __name__ == '__main__':
    app.run(debug=True)
