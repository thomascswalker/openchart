import { ChannelMessage, type Midi } from "@openchart/core";
import Box from "../../shared/Box";
import { vars } from "../../../util/css";
import type { CSSProperties } from "react";
import { Section } from "../../shared/Section";
import { Text } from "../../shared/Text";
interface EventListProps {
  midi: Midi;
}

const EventList = ({ midi }: EventListProps) => {
  const currentTrack = midi.tracks[0];

  const tableStyle: CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
  };
  const cellStyle: CSSProperties = {
    justifyContent: "center",
    alignItems: "center",
    padding: vars("space-large"),
    borderBottom: vars("border-primary"),
    margin: 0,
  };
  const headerStyle: CSSProperties = {
    ...cellStyle,
    position: "sticky",
    top: 0,
    zIndex: 1,
    backgroundColor: vars("primary"),
  };

  return (
    <Box
      padding={0}
      margin={0}
      gap={0}
      border={vars("border-primary")}
      flexDirection="column"
    >
      <Section>{`Track: ${currentTrack.name}`}</Section>
      <Box padding={0} maxHeight="400px" overflowY="auto">
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={headerStyle}>
                <Text>Index</Text>
              </th>
              <th style={headerStyle}>
                <Text>Delta Time</Text>
              </th>
              <th style={headerStyle}>
                <Text>Status</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {currentTrack.events.map((event, index) => (
              <tr key={index}>
                <td style={cellStyle}>
                  <Text justifyContent="center" alignItems="center">
                    {index}
                  </Text>
                </td>
                <td style={cellStyle}>
                  <Text justifyContent="center" alignItems="center">
                    {event.deltaTime}
                  </Text>
                </td>
                <td style={cellStyle}>
                  <Text justifyContent="center" alignItems="center">
                    {ChannelMessage[event.status]}
                  </Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </Box>
  );
};

export default EventList;
